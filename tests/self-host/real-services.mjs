// Disposable local-service profile. No product response is mocked or rewritten.
import assert from 'node:assert/strict';
import { readFile, writeFile, open } from 'node:fs/promises';
import { createServer } from 'node:https';
import { request as upstreamRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pgTlsRelay } from './pg-tls-relay.mjs';

const fixture = JSON.parse(await readFile(process.argv[2], 'utf8'));
const report = { kind: 'forway.real-local-services', rows: [], cleanup: {}, mockedResponses: 0 };
let phase = 'setup', app, relay, databaseRelay, browser, browserServer;
const processes = [];
await writeFile(fixture.processManifest, '[]\n', { flag: 'wx', mode: 0o600 });
async function recordProcess(child, kind) {
  const line = await readFile('/proc/' + child.pid + '/stat', 'utf8');
  const fields = line.slice(line.lastIndexOf(')') + 2).trim().split(/\s+/);
  processes.push({ pid: child.pid, kind, startTime: fields[19], group: Number(fields[2]),
    cmdSha256: createHash('sha256').update(await readFile('/proc/' + child.pid + '/cmdline')).digest('hex') });
  await writeFile(fixture.processManifest, JSON.stringify(processes), { mode: 0o600 });
}
const output = await open(fixture.raw + '/app.stdout', 'ax', 0o600);
const errors = await open(fixture.raw + '/app.stderr', 'ax', 0o600);
const cert = await readFile(fixture.cert), key = await readFile(fixture.key);
const appEnv = { ...process.env, ...fixture.appEnv };
delete appEnv.FORWAY_FIXTURE_ADMIN_KEY;
const authObservations = [];
function passed(id, details = {}) { report.rows.push({ id, status: 'passed', ...details }); }
async function json(url, body, token, admin = false) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST',
    redirect: 'error', signal: AbortSignal.timeout(12000), headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(url.startsWith(fixture.appEnv.FORWAY_APP_ORIGIN) ? { Origin: fixture.appEnv.FORWAY_APP_ORIGIN } : {}),
      ...(admin ? { apikey: fixture.adminKey, Authorization: 'Bearer ' + fixture.adminKey }
        : token ? { Authorization: 'Bearer ' + token } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const api = (path, body, token) => json(fixture.appEnv.FORWAY_APP_ORIGIN + path, body, token);
async function start() {
  assert(!app);
  app = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: fixture.service,
    env: appEnv, stdio: ['ignore', output.fd, errors.fd], detached: true });
  await once(app, 'spawn'); await recordProcess(app, 'app');
  for (let i = 0; i < 60; i++) {
    assert(app.exitCode === null, 'app exited before ready');
    try { const value = await api('/api/cloud-config'); if (value.status === 200 && value.body.available) return; } catch { /* Bounded readiness. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('app_readiness_timeout');
}
async function stop() {
  if (!app) return;
  const owned = app; app = null;
  const exited = owned.exitCode === null ? once(owned, 'exit') : Promise.resolve();
  if (owned.exitCode === null) process.kill(-owned.pid, 'SIGTERM');
  const timeout = setTimeout(() => { try { process.kill(-owned.pid, 'SIGKILL'); } catch {} }, 12000);
  await exited; clearTimeout(timeout);
  assert.equal(owned.exitCode, 0, 'app graceful exit');
  assert.throws(() => process.kill(-owned.pid, 0), { code: 'ESRCH' });
}
async function signin(user) {
  const value = await api('/api/cloud-auth', { action: 'signin', email: user.email, password: user.password });
  assert.equal(value.status, 200, 'real signin status');
  assert.equal(value.body.user.id, user.id); assert.equal(value.body.user.email, user.email);
  return value.body.accessToken;
}
let accepted = false;
try {
  databaseRelay = await pgTlsRelay({ cert, key, port: fixture.databasePort, upstreamPort: fixture.upstreamDatabasePort });
  // Terminate fixture TLS here and forward only to the CLI's fixed loopback gateway.
  relay = createServer({ cert, key, minVersion: 'TLSv1.2' }, async (req, res) => {
    try {
      assert(req.url.startsWith('/auth/v1/'));
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; assert(size <= 262144); chunks.push(chunk); }
      const target = new URL(fixture.gateway);
      const forward = upstreamRequest({ hostname: target.hostname, port: target.port,
        method: req.method, path: req.url, timeout: 6000,
        headers: { ...req.headers, host: target.host, connection: 'close' } }, upstream => {
        authObservations.push({ method: req.method, path: req.url.split('?')[0], status: upstream.statusCode });
        res.writeHead(upstream.statusCode, { 'Content-Type': upstream.headers['content-type'] ?? 'application/json', 'Cache-Control': 'no-store' });
        upstream.pipe(res);
      });
      forward.on('timeout', () => forward.destroy());
      forward.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      forward.end(Buffer.concat(chunks));
    } catch { res.writeHead(400); res.end(); }
  });
  await new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(fixture.authPort, '127.0.0.1', resolve); });
  phase = 'create-real-fixture-users';
  for (const user of fixture.users) {
    const value = await json(fixture.gateway + '/auth/v1/admin/users',
      { email: user.email, password: user.password, email_confirm: true }, null, true);
    assert([200, 201].includes(value.status), 'admin fixture creation');
    assert.equal(typeof value.body.id, 'string'); user.id = value.body.id;
  }
  await start();
  phase = 'R01-real-signin-and-fresh-user';
  const a = await signin(fixture.users[0]);
  const fresh = await api('/api/cloud-auth', { action: 'session' }, a);
  assert.equal(fresh.status, 200); assert.equal(fresh.body.user.id, fixture.users[0].id);
  passed('R01', { freshUserStatus: fresh.status });
  phase = 'R02-real-create-and-receipt';
  const workspace = { version: 1, source: { url: 'https://example.test/authored',
    html: '<!doctype html><title>Owned service fixture</title><h1>Persistent work</h1>', headers: {} }, draft: null, observations: [] };
  const command = { action: 'create', operationId: randomUUID(), title: 'Owned service workspace', workspace };
  const created = await api('/api/workspaces', command, a); assert.equal(created.status, 200);
  const id = created.body.receipt.id; assert.equal(created.body.receipt.revision, 1);
  const repeated = await api('/api/workspaces', command, a); assert.deepEqual(repeated, created);
  passed('R02', { createStatus: created.status, idempotentReplayStatus: repeated.status });
  phase = 'R03-reopen-after-real-node-restart';
  await stop(); await start();
  const reopened = await api('/api/workspaces', { action: 'get', id }, a);
  assert.equal(reopened.status, 200); assert.deepEqual(reopened.body.workspace, workspace);
  assert.equal(reopened.body.title, command.title);
  passed('R03', { reopenStatus: reopened.status, gracefulRestart: true });
  phase = 'R04-real-second-account-isolation';
  const b = await signin(fixture.users[1]);
  const list = await api('/api/workspaces', { action: 'list' }, b);
  assert.equal(list.status, 200); assert.deepEqual(list.body.workspaces, []);
  const foreign = await api('/api/workspaces', { action: 'get', id }, b);
  assert.equal(foreign.status, 404); assert.equal(foreign.body.error.code, 'not_found');
  passed('R04', { otherAccountListStatus: list.status, foreignReadStatus: foreign.status });
  phase = 'R05-real-revision-and-deletion';
  const stale = await api('/api/workspaces', { ...command, action: 'save', id, expectedRevision: 2, operationId: randomUUID() }, a);
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'revision_conflict');
  const saved = await api('/api/workspaces', { ...command, action: 'save', id, expectedRevision: 1, operationId: randomUUID(), title: 'Updated service workspace' }, a);
  assert.equal(saved.status, 200); assert.equal(saved.body.receipt.revision, 2);
  const removed = await api('/api/workspaces', { action: 'delete', id, expectedRevision: 2, operationId: randomUUID() }, a);
  assert.equal(removed.status, 200); assert.equal(removed.body.receipt.deleted, true);
  assert.equal((await api('/api/workspaces', { action: 'get', id }, a)).status, 404);
  passed('R05', { staleStatus: stale.status, saveStatus: saved.status, deleteStatus: removed.status });
  const { chromium } = await import(pathToFileURL(fixture.playwrightModule).href);
  browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1',
    args: ['--ignore-certificate-errors-spki-list=' + fixture.spki] });
  await recordProcess(browserServer.process(), 'chromium');
  browser = await chromium.connect(browserServer.wsEndpoint());
  for (const [index, viewport] of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }].entries()) {
    phase = index === 0 ? 'R06-real-desktop-journey' : 'R07-real-narrow-journey';
    const context = await browser.newContext({ viewport, isMobile: index === 1, hasTouch: index === 1 });
    const page = await context.newPage(); let pageErrors = 0; page.on('pageerror', () => pageErrors++);
    await page.goto(fixture.appEnv.FORWAY_APP_ORIGIN, { waitUntil: 'networkidle' });
    await page.locator('#open-cloud').click();
    await page.locator('#cloud-email').fill(fixture.users[index].email);
    await page.locator('#cloud-password').fill(fixture.users[index].password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('#cloud-name').waitFor();
    await page.locator('.source-details summary').click();
    await page.locator('#html-url').fill('https://example.test/browser-' + index);
    await page.locator('#html-source').fill('<!doctype html><title>Owned browser fixture</title><h1>Reopen this source</h1>');
    await page.getByRole('button', { name: 'Analyze supplied HTML', exact: true }).click();
    await page.locator('#audit-results').waitFor({ state: 'visible' });
    await page.locator('#cloud-name').fill('Owned browser workspace ' + index);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#cloud-status').filter({ hasText: 'Saved to your account' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#open-cloud').click();
    const row = page.locator('.cloud-list li').filter({ hasText: 'Owned browser workspace ' + index });
    await row.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('#audit-results').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#cloud-name').inputValue(), 'Owned browser workspace ' + index);
    assert((await page.locator('#source-context').innerText()).includes('example.test/browser-' + index));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('#confirm-action').click();
    await page.waitForFunction(() => !document.querySelector('.cloud-list'));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.locator('#cloud-email').waitFor();
    assert.equal(pageErrors, 0); await context.close();
    passed(index === 0 ? 'R06' : 'R07', { viewport, realUiSigninSaveReloadOpenDelete: true, pageErrors });
  }
  accepted = true;
} catch (error) {
  report.failure = { phase, type: error.name, code: typeof error.code === 'string' ? error.code : 'assertion_or_runtime_failure',
    ...(typeof error.actual === 'number' ? { actual: error.actual } : {}),
    ...(typeof error.expected === 'number' ? { expected: error.expected } : {}) };
} finally {
  try { if (browser) await browser.close(); report.cleanup.browserClosed = true; } catch { accepted = false; }
  try { if (browserServer) await browserServer.close(); report.cleanup.browserServerClosed = true; } catch { accepted = false; }
  try { await stop(); report.cleanup.appProcessGroupAbsent = true; } catch { accepted = false; }
  if (relay) {
    relay.closeAllConnections();
    await new Promise(resolve => relay.close(resolve)); report.cleanup.authRelayClosed = true;
  }
  if (databaseRelay) {
    report.databaseTlsSessions = databaseRelay.sessions;
    report.cleanup.databaseRelayClosed = await databaseRelay.close();
    if (!report.cleanup.databaseRelayClosed) accepted = false;
  }
  await output.close(); await errors.close();
  report.authTransportObservations = authObservations;
  report.accepted = accepted;
  await writeFile(fixture.report, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ accepted, rows: report.rows.map(row => row.id), failure: report.failure, cleanup: report.cleanup }));
}
process.exitCode = accepted ? 0 : 1;
