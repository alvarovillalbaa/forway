import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAuditHandler } from '../../api/audit.mjs';
import { PageImportError } from '../../src/fetch-page.mjs';

// Authored Node request/response boundary; no server, DNS or upstream provider.
const PAGE = { url: 'https://page.example.org/', html: '<h1>Authored</h1>', status: 200,
  headers: { 'content-type': 'text/html', 'x-robots-tag': null }, fetchedAt: '2026-10-29T12:00:00.000Z', redirects: 0 };
function request(changes = {}) { return Object.assign(new EventEmitter(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: { url: PAGE.url } }, changes); }
function response() {
  return Object.assign(new EventEmitter(), { headers: {}, statusCode: 0, body: null, writes: 0, writableEnded: false, destroyed: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; this.writes += 1; this.writableEnded = true; },
  });
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function invoke(req, changes = {}) {
  const res = response(), calls = [];
  const handler = createAuditHandler({ fetchPage: async (input, options) => { calls.push({ input, options }); return PAGE; }, ...changes });
  await handler(req, res); return { res, calls, data: res.body === null ? null : JSON.parse(res.body) };
}

test('successful POST returns the exact page envelope with noncacheable safe response headers', async () => {
  const { res, calls, data } = await invoke(request());
  assert.equal(res.statusCode, 200); assert.deepEqual(data, { page: PAGE });
  assert.equal(res.headers['cache-control'], 'no-store'); assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(calls[0].input, { url: PAGE.url }); assert.deepEqual(Object.keys(calls[0].options), ['signal']);
});

test('all unsupported methods fail before importing and advertise POST only', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
    const { res, calls, data } = await invoke(request({ method }));
    assert.equal(res.statusCode, 405); assert.equal(data.error.code, 'unsupported_method');
    assert.equal(res.headers.allow, 'POST'); assert.equal(calls.length, 0);
  }
});

test('the endpoint requires JSON rather than accepting a form or arbitrary proxy payload', async () => {
  for (const type of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) {
    const { res, calls } = await invoke(request({ headers: { 'content-type': type } }));
    assert.equal(res.statusCode, 415); assert.equal(calls.length, 0);
  }
});

test('unknown fields nonrecords and accessors never become importer options', async () => {
  for (const body of [null, [], { url: PAGE.url, authorization: 'PRIVATE_TOKEN' }, { url: 1 }]) {
    const { res, calls } = await invoke(request({ body })); assert.equal(res.statusCode, 400); assert.equal(calls.length, 0);
  }
  let reads = 0;
  const body = Object.defineProperty({}, 'url', { enumerable: true, get() { reads += 1; return PAGE.url; } });
  const result = await invoke(request({ body })); assert.equal(result.res.statusCode, 400); assert.equal(reads, 0);
});

test('four-KiB limits cover declared strings buffers objects and streamed requests', async () => {
  for (const req of [request({ headers: { 'content-type': 'application/json', 'content-length': '4097' } }),
    request({ body: 'x'.repeat(4097) }), request({ body: Buffer.alloc(4097) }), request({ body: { url: 'x'.repeat(4097) } }),
    request({ body: undefined, [Symbol.asyncIterator]: async function* () { yield Buffer.alloc(4097); } })]) {
    const { res, calls, data } = await invoke(req); assert.equal(res.statusCode, 413); assert.equal(data.error.code, 'body_too_large'); assert.equal(calls.length, 0);
  }
});

test('malformed JSON invalid UTF-8 and malformed lengths fail with finite request errors', async () => {
  for (const req of [request({ body: '{broken' }), request({ body: Buffer.from([0xc3, 0x28]) }),
    request({ headers: { 'content-type': 'application/json', 'content-length': '-1' } })]) {
    const { res, calls, data } = await invoke(req); assert.equal(res.statusCode, 400); assert.equal(data.error.code, 'invalid_request'); assert.equal(calls.length, 0);
  }
});

test('an actual async request-body iterator can supply bounded JSON in separate byte chunks', async () => {
  const bytes = Buffer.from(JSON.stringify({ url: PAGE.url })); let returned = 0;
  const req = request({ body: undefined, [Symbol.asyncIterator]() { let index = 0;
    return { async next() { return index++ === 0 ? { value: bytes.subarray(0, 10), done: false }
      : index === 2 ? { value: bytes.subarray(10), done: false } : { done: true }; },
    async return() { returned += 1; return { done: true }; } }; } });
  const { res, data } = await invoke(req); assert.equal(res.statusCode, 200); assert.deepEqual(data.page, PAGE); assert.equal(returned, 1);
});

test('importer errors are reconstructed from finite codes instead of trusting exception messages', async () => {
  for (const mutatedCode of [false, true]) {
    const error = new PageImportError('url_not_public'); error.message = 'PRIVATE_IP_10.0.0.1'; error.status = 201;
    if (mutatedCode) error.code = 'PRIVATE_IP_10.0.0.1';
    const { res, data } = await invoke(request(), { fetchPage: async () => { throw error; } });
    assert.equal(res.statusCode, mutatedCode ? 502 : 400);
    assert.equal(data.error.code, mutatedCode ? 'fetch_failed' : 'url_not_public');
    assert.equal(res.body.includes('10.0.0.1'), false); assert.equal(res.body.includes('PRIVATE_IP'), false);
  }
});

test('opaque asynchronous errors including throwing prototype or code getters are safely contained', async () => {
  for (const error of [new Error('PRIVATE_NETWORK_192.168.1.1'),
    Object.defineProperty({}, 'apiCode', { get() { throw new Error('PRIVATE_GETTER'); } }),
    new Proxy({}, { getPrototypeOf() { throw new Error('PRIVATE_PROTOTYPE'); } })]) {
    const { res, data } = await invoke(request(), { fetchPage: async () => { throw error; } });
    assert.equal(res.statusCode, 502); assert.equal(data.error.code, 'fetch_failed'); assert.equal(res.body.includes('PRIVATE'), false);
  }
});

test('a stalled importer is aborted and its late success cannot replace the timeout response', async () => {
  const pending = deferred(); let signal;
  const { res, data } = await invoke(request(), { timeoutMs: 15, fetchPage: (_input, options) => { signal = options.signal; return pending.promise; } });
  assert.equal(res.statusCode, 504); assert.equal(data.error.code, 'fetch_timeout'); assert.equal(signal.aborted, true);
  pending.resolve(PAGE); await new Promise(resolve => setImmediate(resolve)); assert.equal(res.writes, 1);
});

test('stalled body iterators settle within the handler deadline without unhandled cleanup rejections', async () => {
  let returned = 0;
  const req = request({ body: undefined, [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}),
    return() { returned += 1; return Promise.reject(new Error('PRIVATE_BODY_RETURN')); } }; } });
  const { res, calls, data } = await invoke(req, { timeoutMs: 15 });
  assert.equal(res.statusCode, 504); assert.equal(data.error.code, 'fetch_timeout'); assert.equal(calls.length, 0); assert.equal(returned, 1);
});

test('a browser disconnect after request completion aborts the outstanding fetch without writing success', async () => {
  const req = request(), res = response(), entered = deferred(), pending = deferred(); let signal;
  const handler = createAuditHandler({ fetchPage: (_input, options) => { signal = options.signal; entered.resolve(); return pending.promise; } });
  const completion = handler(req, res); await entered.promise;
  res.destroyed = true; res.emit('close'); await completion;
  assert.equal(signal.aborted, true); assert.equal(res.writes, 0);
  pending.resolve(PAGE); await new Promise(resolve => setImmediate(resolve)); assert.equal(res.writes, 0);
});
