// T2: authored fixture bytes over actual public DNS/TLS, no database or production user data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { observeNativeNetwork } from '../helpers/native-network-observer.mjs';
import { FIXTURE_VERSION, HTML } from '../fixtures/native-network.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const observer = observeNativeNetwork();
const report = { kind: 'forway.native-network', sourceCommit: process.env.SOURCE_COMMIT,
  deploymentId: process.env.FORWAY_DEPLOYMENT_ID, node: process.version, dataTier: 'T2',
  cases: [], native: observer.records, cleanup: {}, errors: [] };
const base = 'https://forway.vercel.app/api/check-fixtures/native-page?case=';
let fetchPublicPage, isPublicIPAddress;
const headers = row => new Map(Array.from({ length: row.rawHeaders.length / 2 }, (_, i) => [row.rawHeaders[2 * i].toLowerCase(), row.rawHeaders[2 * i + 1]]));
const rows = identity => report.native.requests.filter(row => row.identity === identity);
async function check(identity, description, operation) {
  if (report.native.requests.some(row => row.status === 401 || row.status === 403)) throw new Error('Access denied; stop without another request');
  const row = { identity, description, passed: false }; report.cases.push(row); observer.select(identity);
  try { await operation(row); row.passed = true; }
  catch (error) { row.error = { name: error.name, message: error.message, stack: error.stack }; }
}
async function rejectCase(identity, selected, code, options) {
  await assert.rejects(fetchPublicPage({ url: base + selected }, options), error => error.code === code);
  assert.equal(rows(identity).length, 1);
  assert.equal(headers(rows(identity)[0]).get('x-forway-fixture'), FIXTURE_VERSION);
}
try {
  assert.equal(process.platform, 'linux'); assert.equal(process.version, 'v26.13.0');
  ({ fetchPublicPage, isPublicIPAddress } = await import('../../src/fetch-page.mjs'));
  await check('N01', 'Real DNS inventory, pinned public peer, TLS hostname and exact authored HTML', async row => {
    const page = await fetchPublicPage({ url: base + 'ok' });
    assert.equal(page.html, HTML); assert.equal(page.url, base + 'ok'); assert.equal(page.redirects, 0);
    assert.equal(rows('N01').length, 1); row.result = page; row.htmlSha256 = sha(Buffer.from(page.html));
  });
  await check('N02', 'Native redirect re-resolves and opens another pinned TLS connection', async row => {
    const page = await fetchPublicPage({ url: base + 'redirect' });
    assert.equal(page.html, HTML); assert.equal(page.url, base + 'ok'); assert.equal(page.redirects, 1);
    assert.equal(rows('N02').length, 2);
    assert.deepEqual(rows('N02').map(r => r.status), [307, 200]);
    assert.equal(report.native.dns.filter(r => r.identity === 'N02').length, 2); row.result = page;
  });
  await check('N03', 'Owned redirect to a reserved invalid host is refused before another DNS or HTTP call', async () => {
    await rejectCase('N03', 'ineligible-redirect', 'url_not_public');
    assert.equal(report.native.dns.filter(r => r.identity === 'N03').length, 1);
    assert.equal(rows('N03')[0].status, 307); assert.equal(report.native.harnessRefusals.length, 0);
  });
  await check('N04', 'Actual malformed UTF8 bytes reject after a native response', async () => {
    await rejectCase('N04', 'invalid-utf8', 'invalid_utf8');
    assert.equal(rows('N04')[0].capturedBytes, 2); assert.equal(rows('N04')[0].bodyDone, true);
  });
  await check('N05', 'Actual over-limit Content-Length rejects before body iteration', async () => {
    await rejectCase('N05', 'oversize', 'response_too_large');
    assert.equal(headers(rows('N05')[0]).get('content-length'), String(1024 * 1024 + 1));
    assert.equal(rows('N05')[0].iteratorOpened, 0);
  });
  await check('N06', 'Actual non-HTML response rejects without parsing its body', async () => {
    await rejectCase('N06', 'unsupported', 'unsupported_content');
    assert.equal(headers(rows('N06')[0]).get('content-type'), 'application/json');
    assert.equal(rows('N06')[0].iteratorOpened, 0);
  });
  await check('N07', 'Native streaming-body deadline closes the owned request and iterator', async row => {
    const start = performance.now();
    await rejectCase('N07', 'slow', 'fetch_timeout', { timeoutMs: 2500 });
    const request = rows('N07')[0];
    assert.equal(request.status, 200); assert.equal(request.iteratorOpened, 1);
    assert.ok(request.capturedBytes > 0); assert.equal(request.iteratorReturned, true);
    row.elapsedMs = performance.now() - start; assert.ok(row.elapsedMs >= 2000 && row.elapsedMs < 6000);
  });
} catch (error) { report.errors.push({ message: error.message, stack: error.stack }); }
finally {
  report.cleanup = await observer.close();
  try {
    assert.equal(report.cases.length, 7); assert.equal(report.native.requests.length, 8);
    assert.equal(report.native.dns.length, 8); assert.equal(report.native.harnessRefusals.length, 0);
    for (const row of report.native.requests) {
      assert.equal(row.method, 'GET'); assert.equal(row.hostHeader, 'forway.vercel.app'); assert.equal(row.credentialsSent, false);
      assert.deepEqual(row.outgoingHeaders, { accept: 'text/html, application/xhtml+xml;q=0.9', 'accept-encoding': 'identity', 'user-agent': 'Forway/0.1 public-page-import' });
      assert.equal(headers(row).get('x-forway-fixture'), FIXTURE_VERSION);
      assert.ok(row.peer && isPublicIPAddress(row.peer.address));
      assert.equal(row.peer.authorized, true); assert.equal(row.peer.servername, 'forway.vercel.app'); assert.equal(row.peer.port, 443);
      assert.equal(row.lookupCalls.length, 1);
      const selected = row.lookupCalls[0].result[0];
      const pinned = Array.isArray(selected) ? selected[0].address : selected;
      assert.equal(row.peer.address, pinned);
      const inventory = report.native.dns.filter(d => d.identity === row.identity && d.startedAt <= row.startedAt && d.finishedAt <= row.startedAt).at(-1);
      assert.ok(inventory && inventory.options.all === true && inventory.options.verbatim === true);
      assert.ok(inventory.records.every(record => isPublicIPAddress(record.address)));
      assert.equal(inventory.records[0].address, pinned);
      assert.equal(row.requestClosed, true); assert.equal(row.responseClosed, true); assert.equal(row.socketClosed, true);
    }
    assert.deepEqual(report.cleanup, { liveSockets: 0, forcedSocketCloses: 0 });
  } catch (error) { report.errors.push({ message: error.message, stack: error.stack }); }
  report.passed = report.cases.length === 7 && report.cases.every(row => row.passed) && report.errors.length === 0;
  process.stdout.write('FORWAY_NATIVE_NETWORK_RESULT=' + JSON.stringify(report) + '\n');
  process.exitCode = report.passed ? 0 : 1;
}
