import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudClient, captureAuthCallback } from '../../public/src/cloud-client.mjs';

const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const session = (owner = id, expiresAt = Date.now() + 3600000) => ({ user: { id: owner, email: 'authored@example.com' }, accessToken: 'authored.access.token', refreshToken: 'authored-refresh', expiresAt });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
const command = { action: 'create', operationId: other, title: 'Authored', workspace: { version: 1, source: null, draft: null, observations: [] } };
const code = (promise, expected) => assert.rejects(promise, cause => cause.code === expected);

await test('C01 callback removes credentials and upstream errors before normal hash navigation', () => {
  let url;
  const result = captureAuthCallback({ hash: '#access_token=authored.access.token&refresh_token=authored-refresh&expires_in=3600&type=recovery', pathname: '/', search: '?a=1' }, { replaceState(a,b,value) { url = value; } });
  assert.equal(url, '/?a=1'); assert.equal(result.recovery, true); assert.ok(result.expiresAt > Date.now());
  assert.deepEqual(captureAuthCallback({ hash: '#error=access_denied&error_description=authored', pathname: '/', search: '' }, { replaceState(a,b,value) { url = value; } }), { invalid: true });
  assert.equal(url, '/');
});
await test('C02 stored session is freshly verified before being accepted', async () => {
  const disk = storage(); disk.setItem('forway.session.v1', JSON.stringify(session()));
  let verified = false;
  const client = createCloudClient({ storage: disk, fetchImpl: async (url, request) => {
    assert.equal(url, '/api/cloud-auth'); assert.equal(JSON.parse(request.body).action, 'session');
    verified = true; return json({ user: session().user });
  } });
  assert.equal(client.user, null); await client.restore(); assert.equal(verified, true); assert.equal(client.user.id, id); client.dispose();
});
await test('C03 a stored session cannot restore under another verified account', async () => {
  const disk = storage(); disk.setItem('forway.session.v1', JSON.stringify(session()));
  const client = createCloudClient({ storage: disk, fetchImpl: async () => json({ user: session(other).user }) });
  await code(client.restore(), 'sign_in_required'); assert.equal(client.user, null); assert.equal(disk.getItem('forway.session.v1'), null);
});
await test('C04 simultaneous operations refresh once and use the fresh token', async () => {
  let refreshes = 0, writes = 0;
  const client = createCloudClient({ storage: storage(), fetchImpl: async (url, request) => {
    const input = JSON.parse(request.body);
    if (input.action === 'signin') return json(session(id, Date.now() - 1));
    if (input.action === 'refresh') { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return json({ ...session(), accessToken: 'fresh.access.token' }); }
    writes++; assert.equal(request.headers.Authorization, 'Bearer fresh.access.token'); return json({ workspaces: [] });
  } });
  await client.signin('authored@example.com', 'authored-password');
  await Promise.all([client.workspace({ action: 'list' }), client.workspace({ action: 'list' })]);
  assert.equal(refreshes, 1); assert.equal(writes, 2); client.dispose();
});
await test('C05 late sign-in response cannot restore a signed-out identity', async () => {
  let finish;
  const disk = storage(), client = createCloudClient({ storage: disk, fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
  const signin = client.signin('authored@example.com', 'authored-password'); await client.signout(); finish(json(session()));
  await code(signin, 'account_changed'); assert.equal(client.user, null); assert.equal(disk.getItem('forway.session.v1'), null);
});
await test('C06 uncertain write is sent once and its original command survives for reconciliation', async () => {
  let writes = 0; const disk = storage();
  const client = createCloudClient({ storage: disk, fetchImpl: async url => {
    if (url === '/api/cloud-auth') return json(session()); writes++; throw new Error('authored response loss');
  } });
  await client.signin('authored@example.com', 'authored-password');
  client.keepPending({ owner: id, command, localRevision: 1, generation: 1 });
  await code(client.workspace(command), 'outcome_unknown'); assert.equal(writes, 1); assert.deepEqual(client.pending().command, command);
  client.dispose();
});
await test('C07 sign-out fences late committed acknowledgments and keeps the pending owner', async () => {
  let finish;
  const client = createCloudClient({ storage: storage(), fetchImpl: async (url, request) => {
    if (url === '/api/cloud-auth') return json(JSON.parse(request.body).action === 'signout' ? {} : session());
    return new Promise(resolve => { finish = resolve; });
  } });
  await client.signin('authored@example.com', 'authored-password'); client.keepPending({ owner: id, command });
  const write = client.workspace(command); await new Promise(resolve => setTimeout(resolve, 0));
  await client.signout(); finish(json({ receipt: { id: other, revision: 1 } }));
  await code(write, 'account_changed'); assert.equal(client.user, null); assert.equal(client.pending().owner, id);
});
await test('C08 a different account cannot replace a retained command with its own write', async () => {
  const client = createCloudClient({ storage: storage(), fetchImpl: async () => json(session(other)) });
  await client.signin('authored@example.com', 'authored-password');
  assert.throws(() => client.keepPending({ owner: id, command }), cause => cause.code === 'account_changed'); client.dispose();
});
await test('C09 storage quota failure occurs before a mutation is submitted', async () => {
  const disk = storage(); let writes = 0;
  const client = createCloudClient({ storage: disk, fetchImpl: async url => { if (url !== '/api/cloud-auth') writes++; return json(session()); } });
  await client.signin('authored@example.com', 'authored-password');
  disk.setItem = () => { throw new Error('Authored quota failure'); };
  assert.throws(() => client.keepPending({ owner: id, command })); assert.equal(writes, 0); client.dispose();
});
await test('C10 receipt clearing is scoped to the exact retained operation', async () => {
  const client = createCloudClient({ storage: storage(), fetchImpl: async () => json(session()) });
  await client.signin('authored@example.com', 'authored-password'); client.keepPending({ owner: id, command });
  client.clearPending(id); assert.ok(client.pending()); client.clearPending(other); assert.equal(client.pending(), null); client.dispose();
});
