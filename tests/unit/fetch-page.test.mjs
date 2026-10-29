import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinnedLookup, fetchPublicPage, isPublicIPAddress, PageImportError,
  PAGE_LIMITS, validatePageImportInput, validatePublicPageURL } from '../../src/fetch-page.mjs';

// Authored adapter responses only: these tests never use native DNS or HTTP.
const URL_INPUT = { url: 'https://page.example.org/source' };
const DATE = new Date('2026-10-29T12:00:00.000Z');
const failure = code => error => error instanceof PageImportError && error.code === code;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function response({ status = 200, headers = [['Content-Type', 'text/html; charset=utf-8']], body = Buffer.from('<h1>Authored</h1>') } = {}) {
  const value = { status, headers, body, closes: 0, close() { value.closes += 1; } }; return value;
}
function authored(page = response(), changes = {}) {
  const calls = { resolve: [], request: [] };
  return { calls, adapters: {
    now: () => DATE,
    resolve: async (host, options) => { calls.resolve.push({ host, options }); return [{ address: '8.8.8.8', family: 4 }]; },
    request: async (url, options) => { calls.request.push({ url: url.href, options }); return page; },
    ...changes,
  } };
}

test('URL validation keeps default-port public URLs and removes only the fragment', () => {
  assert.equal(validatePublicPageURL('https://page.example.org:443/a?q=1#part').href, 'https://page.example.org/a?q=1');
  assert.equal(validatePublicPageURL('http://8.8.8.8:80/a').href, 'http://8.8.8.8/a');
});

test('unsafe URL syntax credentials ports and local hostnames fail before adapters run', () => {
  for (const url of ['file:///etc/passwd', 'ftp://page.example.org/a', 'https://user:secret@page.example.org/',
    'https://page.example.org:8443/', 'https://localhost/', 'http://intranet/', 'http://host.local/',
    'http://metadata.google.internal/', 'http://host.home.arpa/', 'https://page.example.org\\private',
    ' https://page.example.org/', 'https://page.example.org/\n', 'https://page.example.org/' + 'a'.repeat(2048)]) {
    assert.throws(() => validatePublicPageURL(url), PageImportError);
  }
});

test('IPv4 policy denies nonglobal special and metadata ranges including unusual URL spellings', () => {
  for (const address of ['0.1.2.3', '10.0.0.1', '100.64.0.1', '100.100.100.200', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.9', '192.0.2.1', '192.31.196.1',
    '192.52.193.1', '192.88.99.1', '192.168.1.1', '192.175.48.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '255.255.255.255', '168.63.129.16']) assert.equal(isPublicIPAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.128.0.1']) assert.equal(isPublicIPAddress(address), true, address);
  for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://127.1/']) assert.throws(() => validatePublicPageURL(url), failure('url_not_public'));
});

test('IPv6 accepts conservative global unicast and rejects transition documentation and local ranges', () => {
  for (const address of ['::', '::1', '::ffff:8.8.8.8', '64:ff9b::808:808', '100::1', 'fc00::1',
    'fe80::1', 'fe80::1%lo0', 'ff02::1', '2001::1', '2001:2::1', '2001:20::1', '2001:db8::1',
    '2002:808:808::1', '3ffe::1', '3fff::1', '2620:4f:8000::1', '2001:4860::8.8.8.8']) assert.equal(isPublicIPAddress(address), false, address);
  for (const address of ['2001:4860:4860::8888', '2606:4700:4700::1111']) assert.equal(isPublicIPAddress(address), true, address);
});

test('the actual pinned lookup returns one approved address in both native callback forms', () => {
  const pinned = createPinnedLookup('8.8.8.8', 4), calls = [];
  pinned('page.example.org', {}, (...values) => calls.push(values));
  pinned('other.example.org', { all: true }, (...values) => calls.push(values));
  assert.deepEqual(calls, [[null, '8.8.8.8', 4], [null, [{ address: '8.8.8.8', family: 4 }]]]);
});

test('the pinned lookup cannot be constructed with a private address or wrong family', () => {
  for (const [address, family] of [['127.0.0.1', 4], ['::1', 6], ['8.8.8.8', 6], ['not-an-ip', 4]]) {
    assert.throws(() => createPinnedLookup(address, family), failure('url_not_public'));
  }
});

test('a successful import preserves inert HTML and returns only the selected bounded headers', async () => {
  const html = '\ufeff<h1>Authored 🐦</h1><script>never executed</script>';
  const page = response({ body: Buffer.from(html), headers: [['Content-Type', 'text/html; charset=UTF-8'],
    ['X-Robots-Tag', 'noindex'], ['x-robots-tag', 'nofollow'], ['Set-Cookie', 'PRIVATE_COOKIE']] });
  const { calls, adapters } = authored(page);
  assert.deepEqual(await fetchPublicPage(URL_INPUT, adapters), { url: URL_INPUT.url, html, status: 200,
    headers: { 'content-type': 'text/html; charset=UTF-8', 'x-robots-tag': 'noindex, nofollow' },
    fetchedAt: DATE.toISOString(), redirects: 0 });
  assert.equal(calls.resolve.length, 1); assert.equal(calls.request.length, 1);
  assert.equal(calls.request[0].options.address, '8.8.8.8'); assert.equal(calls.request[0].options.family, 4);
  assert.equal(calls.request[0].options.signal instanceof AbortSignal, true); assert.equal(page.closes, 1);
});

test('a public literal address skips DNS but still uses its validated pin', async () => {
  const { calls, adapters } = authored();
  await fetchPublicPage({ url: 'https://8.8.8.8/' }, adapters);
  assert.equal(calls.resolve.length, 0); assert.equal(calls.request[0].options.address, '8.8.8.8');
});

test('any private address in an otherwise public DNS answer blocks the complete request', async () => {
  const { calls, adapters } = authored(response(), { resolve: async () => [
    { address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 },
  ] });
  await assert.rejects(fetchPublicPage(URL_INPUT, adapters), failure('url_not_public'));
  assert.equal(calls.request.length, 0);
});

test('empty malformed wrong-family and oversized DNS inventories cannot dispatch', async () => {
  for (const records of [[], null, [{ address: '8.8.8.8', family: 6 }], [{ address: 'not-an-ip', family: 4 }],
    Array.from({ length: 33 }, () => ({ address: '8.8.8.8', family: 4 }))]) {
    const { calls, adapters } = authored(response(), { resolve: async () => records });
    await assert.rejects(fetchPublicPage(URL_INPUT, adapters), failure('url_not_public')); assert.equal(calls.request.length, 0);
  }
});

test('DNS exceptions expose a finite error without the resolver address or exception text', async () => {
  const { adapters } = authored(response(), { resolve: async () => { throw new Error('PRIVATE_DNS_10.0.0.1'); } });
  await assert.rejects(fetchPublicPage(URL_INPUT, adapters), error => failure('dns_failed')(error)
    && !error.message.includes('10.0.0.1') && !error.message.includes('PRIVATE_DNS'));
});

test('every redirect receives fresh DNS validation and all owned responses are closed', async () => {
  const first = response({ status: 302, headers: [['location', 'https://next.example.org/final']] }), second = response();
  const { calls, adapters } = authored(); let index = 0;
  adapters.request = async (url, options) => { calls.request.push({ url: url.href, options }); return index++ ? second : first; };
  const result = await fetchPublicPage(URL_INPUT, adapters);
  assert.equal(result.url, 'https://next.example.org/final'); assert.equal(result.redirects, 1);
  assert.deepEqual(calls.resolve.map(value => value.host), ['page.example.org', 'next.example.org']);
  assert.equal(first.closes, 1); assert.equal(second.closes, 1);
});

test('redirects to private addresses credentials or nondefault ports stop before another dispatch', async () => {
  for (const target of ['http://169.254.169.254/latest/meta-data/', 'https://user:secret@next.example.org/', 'https://next.example.org:8443/']) {
    const page = response({ status: 302, headers: [['location', target]] }), { calls, adapters } = authored(page);
    await assert.rejects(fetchPublicPage(URL_INPUT, adapters), PageImportError);
    assert.equal(calls.request.length, 1); assert.equal(page.closes, 1);
  }
});

test('four redirects can complete but a fifth redirect cannot issue a sixth request', async () => {
  for (const completes of [true, false]) {
    const pages = [], { adapters } = authored();
    adapters.request = async () => {
      const page = completes && pages.length === 4 ? response() : response({ status: 302, headers: [['location', `/hop-${pages.length + 1}`]] });
      pages.push(page); return page;
    };
    if (completes) assert.equal((await fetchPublicPage(URL_INPUT, adapters)).redirects, 4);
    else await assert.rejects(fetchPublicPage(URL_INPUT, adapters), failure('redirect_limit'));
    assert.equal(pages.length, 5); assert.ok(pages.every(page => page.closes === 1));
  }
});

test('a redirect loop fails immediately instead of repeatedly importing the same page', async () => {
  const page = response({ status: 301, headers: [['location', URL_INPUT.url]] }), { calls, adapters } = authored(page);
  await assert.rejects(fetchPublicPage(URL_INPUT, adapters), failure('redirect_limit'));
  assert.equal(calls.request.length, 1); assert.equal(page.closes, 1);
});

test('failed upstream statuses and non-HTML responses never become page imports', async () => {
  for (const page of [response({ status: 404 }), response({ status: 500 }), response({ headers: [['content-type', 'application/json']] })]) {
    await assert.rejects(fetchPublicPage(URL_INPUT, authored(page).adapters), failure('unsupported_content'));
    assert.equal(page.closes, 1);
  }
  assert.equal((await fetchPublicPage(URL_INPUT, authored(response({ headers: [['content-type', 'application/xhtml+xml']] })).adapters)).status, 200);
});

test('compression and incompatible declared charsets are rejected rather than silently reinterpreted', async () => {
  for (const headers of [[['content-type', 'text/html'], ['content-encoding', 'gzip']],
    [['content-type', 'text/html; charset=iso-8859-1']], [['content-type', 'text/html; charset=utf-8; charset=us-ascii']]]) {
    await assert.rejects(fetchPublicPage(URL_INPUT, authored(response({ headers })).adapters), failure('unsupported_encoding'));
  }
});

test('invalid UTF-8 and non-ASCII bytes under an ASCII declaration fail without replacement characters', async () => {
  for (const page of [response({ body: Buffer.from([0xc3, 0x28]) }),
    response({ body: Buffer.from('é'), headers: [['content-type', 'text/html; charset=us-ascii']] })]) {
    await assert.rejects(fetchPublicPage(URL_INPUT, authored(page).adapters), failure('invalid_utf8'));
  }
});

test('body limits apply to declared bytes streamed bytes and the exact accepted boundary', async () => {
  const exact = Buffer.alloc(PAGE_LIMITS.bodyBytes, 97);
  assert.equal((await fetchPublicPage(URL_INPUT, authored(response({ body: exact })).adapters)).html.length, exact.length);
  const declared = response({ headers: [['content-type', 'text/html'], ['content-length', String(exact.length + 1)]] });
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(declared).adapters), failure('response_too_large'));
  const streamed = response({ body: (async function* () { yield exact; yield Buffer.from('x'); })() });
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(streamed).adapters), failure('response_too_large'));
  assert.equal(streamed.closes, 1);
});

test('header count bytes selected-field bounds duplicates and control characters fail closed', async () => {
  for (const headers of [Array.from({ length: 101 }, () => ['x-test', 'a']), [['x-large', 'x'.repeat(16384)]],
    [['content-type', 'text/html'], ['x-robots-tag', 'a'.repeat(4097)]],
    [['content-type', 'text/html'], ['Content-Type', 'application/xhtml+xml']], [['content-type', 'text/html\r\nX-Evil: yes']]]) {
    await assert.rejects(fetchPublicPage(URL_INPUT, authored(response({ headers })).adapters), failure('invalid_headers'));
  }
});

test('a mismatched declared length or an opaque upstream error cannot return a partial successful page', async () => {
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(response({ headers: [['content-type', 'text/html'], ['content-length', '999']] })).adapters), failure('fetch_failed'));
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(response(), { request: async () => { throw new Error('PRIVATE_192.168.0.1'); } }).adapters), error =>
    failure('fetch_failed')(error) && !error.message.includes('192.168'));
});

test('the owned deadline settles stalled DNS and request adapters and closes a late response', async () => {
  const dns = deferred();
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(response(), { resolve: () => dns.promise, timeoutMs: 15 }).adapters), failure('fetch_timeout'));
  dns.resolve([{ address: '8.8.8.8', family: 4 }]);
  const pending = deferred(), late = response();
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(response(), { request: () => pending.promise, timeoutMs: 15 }).adapters), failure('fetch_timeout'));
  pending.resolve(late); await new Promise(resolve => setImmediate(resolve)); assert.equal(late.closes, 1);
});

test('a stalled body is cancelled with owned response cleanup and rejected iterator cleanup is contained', async () => {
  let returned = 0;
  const page = response({ body: { [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}),
    return() { returned += 1; return Promise.reject(new Error('PRIVATE_RETURN_FAILURE')); } }; } } });
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(page, { timeoutMs: 15 }).adapters), failure('fetch_timeout'));
  assert.equal(page.closes, 1); assert.equal(returned, 1);
});

test('input shape caller cancellation and monotonic deadlines cannot dispatch or acknowledge late work', async () => {
  for (const value of [null, [], { url: URL_INPUT.url, headers: {} }, { url: 1 }]) assert.throws(() => validatePageImportInput(value), failure('invalid_request'));
  const controller = new AbortController(); controller.abort(); const { calls, adapters } = authored(response(), { signal: controller.signal });
  await assert.rejects(fetchPublicPage(URL_INPUT, adapters), failure('fetch_timeout')); assert.equal(calls.request.length, 0);
  const page = response(); let dispatched = false;
  await assert.rejects(fetchPublicPage(URL_INPUT, authored(page, { timeoutMs: 40, request: () => {
    dispatched = true;
    const end = performance.now() + 60; while (performance.now() < end) { /* Authored blocking callback only. */ }
    return page;
  } }).adapters), failure('fetch_timeout'));
  assert.equal(page.closes, dispatched ? 1 : 0);
});
