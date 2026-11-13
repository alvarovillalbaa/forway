import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cloudConfig, databaseConfig } from '../../src/cloud/config.mjs';
import { createAuth, bearer } from '../../src/cloud/auth.mjs';
import { normalizeCommand } from '../../src/cloud/commands.mjs';
import { createJsonHandler } from '../../src/cloud/http.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const config = { authOrigin: 'https://auth.example.com', appOrigin: 'https://app.example.com', key: 'sb_publishable_authored_fixture_only', emailEnabled: false };
const user = { id, email: 'authored@example.com', role: 'authenticated', is_anonymous: false, email_confirmed_at: '2026-11-13T10:00:00Z' };
const tokens = { access_token: 'authored.access.token', refresh_token: 'authored-refresh', expires_in: 3600 };
const workspace = { version: 1, source: null, draft: null, observations: [] };
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

await test('A01 configuration admits only HTTPS origins and a publishable key', () => {
  const env = { FORWAY_SUPABASE_URL: config.authOrigin, FORWAY_APP_ORIGIN: config.appOrigin, FORWAY_SUPABASE_PUBLISHABLE_KEY: config.key };
  assert.equal(cloudConfig(env).emailEnabled, false);
  for (const key of ['sb_secret_authored_forbidden','eyJhbGciOiJIUzI1NiJ9.authored.privileged','']) assert.throws(() => cloudConfig({ ...env, FORWAY_SUPABASE_PUBLISHABLE_KEY: key }));
  for (const url of ['http://auth.example.com','https://u:p@auth.example.com','https://auth.example.com/path','https://auth.example.com/?x=1']) assert.throws(() => cloudConfig({ ...env, FORWAY_SUPABASE_URL: url }));
});
await test('A02 database URL cannot weaken TLS, read certificate files or inherit connection fields', () => {
  const env = { FORWAY_DATABASE_URL: 'postgresql://forway_runtime:authored%40password@db.example.com:6543/postgres' };
  const actual = databaseConfig(env); assert.equal(actual.password, 'authored@password'); assert.equal(actual.port, 6543); assert.equal(actual.ssl.rejectUnauthorized, true);
  assert.equal(actual.user, 'forway_runtime'); assert.equal(actual.database, 'postgres');
  for (const suffix of ['?sslmode=disable','?sslrootcert=/etc/passwd','?options=anything','#fragment']) assert.throws(() => databaseConfig({ ...env, FORWAY_DATABASE_URL: env.FORWAY_DATABASE_URL + suffix }));
  assert.throws(() => databaseConfig({ FORWAY_DATABASE_URL: 'postgres://db.example.com/postgres' }));
});
await test('A03 fresh user lookup uses fixed origin, no redirects or cookies, and returns only verified identity', async () => {
  let request;
  const auth = createAuth({ config, fetchImpl: async (...args) => { request = args; return json({ ...user, user_metadata: { id: other, role: 'admin' } }); } });
  assert.deepEqual(await auth.verify(tokens.access_token), { id, email: user.email });
  assert.equal(request[0], config.authOrigin + '/auth/v1/user'); assert.equal(request[1].redirect, 'error'); assert.equal(request[1].credentials, 'omit');
  assert.equal(request[1].headers.Authorization, 'Bearer ' + tokens.access_token);
});
await test('A04 unconfirmed, anonymous, malformed, banned and deleted identities cannot access storage', async () => {
  for (const patch of [{ email_confirmed_at: null }, { is_anonymous: true }, { id: 'owner' }, { role: 'service_role' }, { deleted_at: '2026-11-13' }, { banned_until: '2999-01-01' }]) {
    await rejects(createAuth({ config, fetchImpl: async () => json({ ...user, ...patch }) }).verify(tokens.access_token), 'sign_in_required');
  }
});
await test('A05 bearer syntax rejects header injection and empty or oversized credentials', () => {
  assert.equal(bearer('Bearer authored.token'), 'authored.token');
  for (const header of [undefined,'bearer token','Bearer ','Bearer token\nheader', 'Bearer ' + 'a'.repeat(16385)]) assert.throws(() => bearer(header));
});
await test('A06 password sign-in verifies the fresh account before exposing session tokens', async () => {
  const urls = []; const auth = createAuth({ config, fetchImpl: async (url, options) => {
    urls.push(url); if (url.endsWith('/user')) return json(user);
    assert.deepEqual(JSON.parse(options.body), { email: user.email, password: 'authored-password' }); return json(tokens);
  } });
  const result = await auth.execute({ action: 'signin', email: user.email, password: 'authored-password' });
  assert.equal(result.user.id, id); assert.equal(result.refreshToken, tokens.refresh_token); assert.equal(urls.length, 2);
});
await test('A07 failed fresh verification never returns an upstream token session', async () => {
  await rejects(createAuth({ config, fetchImpl: async url => url.endsWith('/user') ? json({}, 401) : json(tokens) })
    .execute({ action: 'signin', email: user.email, password: 'authored-password' }), 'sign_in_required');
});
await test('A08 refresh refuses a different verified account and validates expected identity before egress', async () => {
  let calls = 0;
  const auth = createAuth({ config, fetchImpl: async url => { calls++; return url.endsWith('/user') ? json({ ...user, id: other }) : json(tokens); } });
  await rejects(auth.execute({ action: 'refresh', refreshToken: tokens.refresh_token, expectedId: 'invalid' }), 'invalid_request'); assert.equal(calls, 0);
  await rejects(auth.execute({ action: 'refresh', refreshToken: tokens.refresh_token, expectedId: id }), 'sign_in_required');
});
await test('A09 upstream errors, rate limiting and oversized bodies expose finite errors only', async () => {
  for (const [status, code] of [[401,'sign_in_required'],[429,'rate_limited'],[500,'auth_unavailable']]) {
    await rejects(createAuth({ config, fetchImpl: async () => json({ secret: 'authored-private-detail' }, status) }).verify(tokens.access_token), code);
  }
  await rejects(createAuth({ config, fetchImpl: async () => json({ body: 'x'.repeat(65537) }) }).verify(tokens.access_token), 'auth_unavailable');
  await rejects(createAuth({ config, fetchImpl: async () => { throw new Error('authored upstream detail'); } }).verify(tokens.access_token), 'auth_unavailable');
});
await test('A10 email flows stay disabled without provider qualification', async () => {
  let calls = 0; const auth = createAuth({ config, fetchImpl: async () => { calls++; return json({}); } });
  await rejects(auth.execute({ action: 'signup', email: user.email, password: 'authored-password' }), 'email_unavailable');
  await rejects(auth.execute({ action: 'recover', email: user.email }), 'email_unavailable'); assert.equal(calls, 0);
});
await test('A11 enabled email flows accept only fixed redirects and never forward client metadata or URLs', async () => {
  const calls = []; const auth = createAuth({ config: { ...config, emailEnabled: true }, fetchImpl: async (...args) => { calls.push(args); return json({}); } });
  await auth.execute({ action: 'recover', email: user.email });
  assert.equal(new URL(calls[0][0]).searchParams.get('redirect_to'), config.appOrigin + '/');
  await rejects(auth.execute({ action: 'signup', email: user.email, password: 'authored-password', redirect_to: 'https://foreign.example/' }), 'invalid_request'); assert.equal(calls.length, 1);
});
await test('A12 workspace commands reject owners, unknown actions, accessors, malformed titles and unsafe revisions', () => {
  const input = { action: 'create', operationId: id, title: 'Author', workspace };
  for (const patch of [{ owner_id: other }, { action: 'sql' }, { title: '\ud800' }, { title: '   ' }, { title: 'x\ny' }]) assert.throws(() => normalizeCommand({ ...input, ...patch }));
  const accessor = { ...input }; Object.defineProperty(accessor, 'workspace', { enumerable: true, get() { throw new Error('Do not invoke'); } });
  assert.throws(() => normalizeCommand(accessor), e => e.code === 'invalid_request');
  assert.throws(() => normalizeCommand({ action: 'delete', operationId: id, id, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }));
  assert.ok(normalizeCommand(input).documentText.endsWith('\n'));
});

async function invoke({ method = 'POST', headers = {}, body = { action: 'list' }, stream, execute = async () => ({ ok: true }), maxBytes } = {}) {
  const req = new EventEmitter(), res = new EventEmitter();
  Object.assign(req, { method, headers: { origin: config.appOrigin, 'content-type': 'application/json', ...headers }, body });
  if (stream) { delete req.body; req[Symbol.asyncIterator] = () => stream; }
  res.setHeader = () => {}; res.end = text => { res.writableEnded = true; res.body = JSON.parse(text); };
  await createJsonHandler({ config: () => config, execute, maxBytes })(req, res);
  assert.equal(req.listenerCount('aborted'), 0); assert.equal(res.listenerCount('close'), 0);
  return res;
}
await test('A13 HTTP refuses cross-origin, missing origin, wrong method and wrong media before execution', async () => {
  let calls = 0; const execute = async () => { calls++; return {}; };
  for (const [input,status] of [[{ headers: { origin: 'https://foreign.example' } },403], [{ headers: { origin: undefined } },403],
    [{ headers: { 'sec-fetch-site': 'cross-site' } },403], [{ method: 'GET' },405], [{ headers: { 'content-type': 'text/plain' } },415]]) {
    assert.equal((await invoke({ ...input, execute })).statusCode, status);
  }
  assert.equal(calls, 0);
});
await test('A14 HTTP bounds declared, streamed and already parsed requests and rejects malformed UTF-8', async () => {
  assert.equal((await invoke({ headers: { 'content-length': '99999' }, maxBytes: 100 })).statusCode, 413);
  assert.equal((await invoke({ body: { x: 'a'.repeat(101) }, maxBytes: 100 })).statusCode, 413);
  const stream = { async next() { return { value: Buffer.alloc(101), done: false }; }, async return() { return { done: true }; } };
  assert.equal((await invoke({ stream, maxBytes: 100 })).statusCode, 413);
  assert.equal((await invoke({ body: Buffer.from([0xc3,0x28]) })).statusCode, 400);
});
await test('A15 HTTP hides SQL/provider details, preserves known conflict codes and returns valid results', async () => {
  const response = await invoke({ execute: async () => { throw new Error('authored database password'); } });
  assert.equal(response.statusCode, 503); assert.equal(JSON.stringify(response.body).includes('password'), false);
  const valid = await invoke(); assert.equal(valid.statusCode, 200); assert.deepEqual(valid.body, { ok: true });
});
