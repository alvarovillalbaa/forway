import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createWorkspaceStore } from '../../src/cloud/store.mjs';

// This entry point is admitted only inside the owned, networkless CI fixture.
assert.equal(process.env.FORWAY_DISPOSABLE_DATABASE, 'owned-networkless-container');
const socket = process.env.FORWAY_TEST_SOCKET;
assert.ok(socket?.startsWith(process.env.RUNNER_TEMP + '/forway-workspaces-'));
const settings = { host: socket, port: 5432, database: 'postgres', password: '', ssl: false,
  connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 4000, lock_timeout: 2000 };
const admin = new Client({ ...settings, user: 'postgres' });
await admin.connect();
assert.equal((await admin.query('SHOW server_version_num')).rows[0].server_version_num, '170012');
assert.deepEqual((await admin.query("SELECT nspname FROM pg_namespace WHERE nspname='forway_private'")).rows, []);
await admin.query(await readFile(new URL('../../db/bootstrap.sql', import.meta.url), 'utf8'));
await admin.query('ALTER ROLE forway_runtime LOGIN');
const clients = new Set();
const factory = () => {
  const client = new Client({ ...settings, user: 'forway_runtime' }); clients.add(client);
  const end = client.end.bind(client); client.end = async () => { try { await end(); } finally { clients.delete(client); } };
  return client;
};
const store = createWorkspaceStore({ createClient: factory });
const A = randomUUID(), B = randomUUID();
const workspace = { version: 1, source: { url: 'https://example.com/', html: '<p>Authored café 🌱</p>', headers: {} }, draft: null, observations: [] };
const make = (extra = {}) => ({ action: 'create', operationId: randomUUID(), title: 'Authored workspace', workspace, ...extra });
const rejectCode = (promise, code) => assert.rejects(promise, error => error.code === code);
let first;
try {
  await test('P01 private tables force RLS; runtime has no table ownership, DDL or public grant', async () => {
    const rows = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='forway_private' AND c.relname IN ('workspaces','operations')`)).rows;
    assert.equal(rows.length, 2);
    for (const row of rows) { assert.equal(row.relrowsecurity, true); assert.equal(row.relforcerowsecurity, true); assert.notEqual(row.owner, 'forway_runtime'); }
    await admin.query('CREATE ROLE forway_disposable_anon NOLOGIN');
    assert.equal((await admin.query("SELECT has_schema_privilege('forway_disposable_anon','forway_private','USAGE') AS ok")).rows[0].ok, false);
    assert.equal((await admin.query("SELECT has_schema_privilege('forway_runtime','forway_private','CREATE') AS ok")).rows[0].ok, false);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='forway_private' AND p.prosecdef")).rows[0].n, 0);
  });
  await test('P02 a bare runtime connection has no actor and cannot create or read owned content', async () => {
    const client = factory(); await client.connect();
    try {
      assert.deepEqual((await client.query('SELECT * FROM forway_private.workspaces')).rows, []);
      await assert.rejects(client.query(`INSERT INTO forway_private.workspaces
        (id,owner_id,title,document_text,content_hash,revision) VALUES ($1,$2,'forbidden','{}','bad',1)`, [randomUUID(), A]), error => error.code === '42501');
      await assert.rejects(client.query('TRUNCATE forway_private.workspaces'), error => error.code === '42501');
    } finally { await client.end(); }
  });
  await test('P03 create then reopen across independent connections retains exact validated workspace', async () => {
    first = (await store(A, make({ title: "Café'); DROP SCHEMA public; --" }))).receipt;
    assert.equal(first.revision, 1); assert.equal(first.deleted, false);
    const loaded = await store(A, { action: 'get', id: first.id });
    assert.deepEqual(loaded.workspace, workspace); assert.equal(loaded.title, "Café'); DROP SCHEMA public; --");
    assert.deepEqual(loaded.receipt, first);
    assert.equal((await store(A, { action: 'list' })).workspaces[0].id, first.id);
  });
  await test('P04 other accounts cannot list, read, overwrite, delete or inspect receipts', async () => {
    const command = make(); const own = (await store(A, command)).receipt;
    assert.deepEqual((await store(B, { action: 'list' })).workspaces, []);
    await rejectCode(store(B, { action: 'get', id: own.id }), 'not_found');
    await rejectCode(store(B, { action: 'save', id: own.id, expectedRevision: 1, operationId: randomUUID(), title: 'foreign', workspace }), 'not_found');
    await rejectCode(store(B, { action: 'delete', id: own.id, expectedRevision: 1, operationId: randomUUID() }), 'not_found');
    assert.deepEqual(await store(B, { action: 'operation', operationId: command.operationId }), { receipt: null });
  });
  await test('P05 simultaneous independent saves admit one expected revision and preserve the winning document', async () => {
    const commands = ['One', 'Two'].map(title => ({ action: 'save', id: first.id, expectedRevision: 1, operationId: randomUUID(), title, workspace }));
    const results = await Promise.allSettled(commands.map(c => store(A, c)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'revision_conflict');
    const winner = results.findIndex(r => r.status === 'fulfilled');
    const loaded = await store(A, { action: 'get', id: first.id });
    assert.equal(loaded.receipt.revision, 2); assert.equal(loaded.title, commands[winner].title);
  });
  await test('P06 parallel identical creates return the original receipt and create one workspace', async () => {
    const command = make(); const results = await Promise.all([store(A, command), store(A, command)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM forway_private.workspaces WHERE id=$1', [results[0].receipt.id])).rows[0].n, 1);
    assert.deepEqual(await store(A, { action: 'operation', operationId: command.operationId }), results[0]);
  });
  await test('P07 changing a payload under an existing operation ID rejects without mutation', async () => {
    const command = make(); const initial = await store(A, command);
    await rejectCode(store(A, { ...command, title: 'changed' }), 'operation_conflict');
    assert.equal((await store(A, { action: 'get', id: initial.receipt.id })).title, command.title);
  });
  await test('P08 actual COMMIT followed by a lost response stays unknown and reconciles without duplicate write', async () => {
    const command = make(); let committed = false;
    const uncertain = createWorkspaceStore({ createClient: () => {
      const client = factory(), query = client.query.bind(client);
      client.query = async (...args) => { const result = await query(...args); if (args[0] === 'COMMIT') { committed = true; throw new Error('authored response loss'); } return result; };
      return client;
    } });
    await rejectCode(uncertain(A, command), 'outcome_unknown'); assert.equal(committed, true);
    const found = await store(A, { action: 'operation', operationId: command.operationId });
    assert.ok(found.receipt); assert.deepEqual(await store(A, command), found);
    assert.equal((await store(A, { action: 'get', id: found.receipt.id })).receipt.revision, 1);
  });
  await test('P09 failed receipt write rolls back content and leaves no accepted operation', async () => {
    const command = make(); const before = (await store(A, { action: 'list' })).workspaces.length;
    const broken = createWorkspaceStore({ createClient: () => {
      const client = factory(), query = client.query.bind(client);
      client.query = (...args) => { if (args[0].startsWith('INSERT INTO forway_private.operations')) throw new Error('authored failure'); return query(...args); };
      return client;
    } });
    await rejectCode(broken(A, command), 'outcome_unknown');
    assert.equal((await store(A, { action: 'list' })).workspaces.length, before);
    assert.equal((await store(A, { action: 'operation', operationId: command.operationId })).receipt, null);
  });
  await test('P10 delete removes content and title; old metadata receipts cannot resurrect it', async () => {
    const create = make(), created = await store(A, create);
    const command = { action: 'delete', id: created.receipt.id, expectedRevision: 1, operationId: randomUUID() };
    const deleted = await store(A, command); assert.equal(deleted.receipt.deleted, true); assert.equal(deleted.receipt.revision, 2);
    assert.deepEqual(await store(A, command), deleted);
    await rejectCode(store(A, { action: 'get', id: created.receipt.id }), 'not_found');
    await store(A, create);
    await rejectCode(store(A, { action: 'get', id: created.receipt.id }), 'not_found');
    const row = (await admin.query('SELECT title,document_text,content_hash FROM forway_private.workspaces WHERE id=$1', [created.receipt.id])).rows[0];
    assert.deepEqual(row, { title: '', document_text: null, content_hash: null });
    const receipts = (await admin.query('SELECT receipt FROM forway_private.operations WHERE owner_id=$1', [A])).rows;
    for (const { receipt } of receipts) assert.deepEqual(Object.keys(receipt).sort(), ['id','revision','contentHash','deleted','createdAt','updatedAt'].sort());
  });
  await test('P11 transaction-local actor resets after commit and rollback on the same native connection', async () => {
    const client = factory(); await client.connect();
    try {
      for (const end of ['COMMIT','ROLLBACK']) {
        await client.query('BEGIN'); await client.query("SELECT set_config('forway.actor_id',$1,true)", [A]);
        assert.ok((await client.query('SELECT * FROM forway_private.workspaces')).rows.length > 0);
        await client.query(end);
        assert.deepEqual((await client.query('SELECT * FROM forway_private.workspaces')).rows, []);
      }
    } finally { await client.end(); }
  });
  await test('P12 malformed workspace and caller-selected owner reject before any connection', async () => {
    let opened = 0; const sealed = createWorkspaceStore({ createClient: () => { opened++; throw new Error(); } });
    await rejectCode(sealed(A, make({ workspace: { ...workspace, unknown: true } })), 'invalid_workspace');
    await rejectCode(sealed(A, { ...make(), owner_id: B }), 'invalid_request'); assert.equal(opened, 0);
  });
  await test('P13 cancellation closes a real blocked database operation without a committed change', async () => {
    const own = (await store(A, make())).receipt;
    const command = { action: 'save', id: own.id, expectedRevision: 1, operationId: randomUUID(), title: 'cancelled', workspace };
    await admin.query('BEGIN'); await admin.query('SELECT id FROM forway_private.workspaces WHERE id=$1 FOR UPDATE', [own.id]);
    const controller = new AbortController(); const pending = store(A, command, { signal: controller.signal });
    const outcome = rejectCode(pending, 'outcome_unknown');
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        await admin.query('SELECT pg_stat_clear_snapshot()');
        blocked = (await admin.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename='forway_runtime' AND wait_event_type='Lock' AND pg_backend_pid()=ANY(pg_blocking_pids(pid))) AS blocked")).rows[0].blocked;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true); controller.abort(); await outcome;
    } finally { controller.abort(); await admin.query('ROLLBACK'); await outcome; }
    assert.equal((await store(A, { action: 'operation', operationId: command.operationId })).receipt, null);
    assert.equal((await store(A, { action: 'get', id: own.id })).receipt.revision, 1);
  });
  await test('P14 a privileged connection is refused before any user content query', async () => {
    await rejectCode(createWorkspaceStore({ createClient: () => new Client({ ...settings, user: 'postgres' }) })(A, { action: 'list' }), 'store_unavailable');
  });
  await test('P15 concurrent creates obey the per-owner active workspace limit; deleting releases a slot', async () => {
    const owner = randomUUID();
    for (let i = 0; i < 24; i++) await store(owner, make());
    const results = await Promise.allSettled([store(owner, make()), store(owner, make())]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'workspace_limit');
    const one = (await store(owner, { action: 'list' })).workspaces[0];
    await store(owner, { action: 'delete', id: one.id, expectedRevision: 1, operationId: randomUUID() });
    await store(owner, make()); assert.equal((await store(owner, { action: 'list' })).workspaces.length, 25);
  });
} finally {
  await Promise.all([...clients].map(client => client.end())); await admin.end();
  assert.equal(clients.size, 0);
}
