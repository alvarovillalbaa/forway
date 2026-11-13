import { createHash, randomUUID } from 'node:crypto';
import { parseWorkspace } from '../../public/src/workspace.mjs';
import { CloudError, fail, normalizeCommand, uuid } from './commands.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fields = 'id, revision, content_hash, created_at, updated_at, deleted_at';
function receipt(row) {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) fail('store_unavailable');
  return { id: row.id, revision, contentHash: row.content_hash,
    deleted: row.deleted_at !== null, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

// Only the fixed API action vocabulary reaches SQL; no caller-selected SQL or owner.
export function createWorkspaceStore({ createClient }) {
  if (typeof createClient !== 'function') throw new TypeError('A private database client factory is required.');
  return async function execute(actorId, input, { signal } = {}) {
    const actor = uuid(actorId), command = normalizeCommand(input);
    const mutating = ['create', 'save', 'delete'].includes(command.action);
    let client, ending, begun = false, commitStarted = false;
    const stop = () => { if (client) ending ??= Promise.resolve().then(() => client.end()).catch(() => {}); };
    const guard = () => { if (signal?.aborted) fail(mutating ? 'outcome_unknown' : 'store_unavailable'); };
    const query = async (text, values = []) => { guard(); return client.query(text, values); };
    try {
      guard(); client = await createClient(); client.on('error', stop);
      signal?.addEventListener('abort', stop, { once: true }); guard();
      await client.connect(); guard();
      const role = (await query(`SELECT current_user AS name, r.rolsuper, r.rolbypassrls,
        r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolinherit,
        EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS member
        FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];
      if (!role || role.name !== 'forway_runtime' || ['rolsuper','rolbypassrls','rolcreatedb',
        'rolcreaterole','rolreplication','rolinherit','member'].some(key => role[key] !== false)) fail('store_unavailable');
      await query('BEGIN'); begun = true;
      await query("SELECT set_config('forway.actor_id', $1, true)", [actor]);
      if ((await query('SELECT version FROM forway_private.schema_version')).rows[0]?.version !== 1) fail('store_unavailable');
      let result;
      if (command.action === 'list') {
        const rows = (await query(`SELECT ${fields}, title FROM forway_private.workspaces
          WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 25`, [actor])).rows;
        result = { workspaces: rows.map(row => ({ ...receipt(row), title: row.title })) };
      } else if (command.action === 'get') {
        const row = (await query(`SELECT ${fields}, title, document_text FROM forway_private.workspaces
          WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`, [command.id, actor])).rows[0];
        if (!row) fail('not_found');
        if (hash(row.document_text) !== row.content_hash) fail('store_unavailable');
        result = { workspace: parseWorkspace(row.document_text), title: row.title, receipt: receipt(row) };
      } else if (command.action === 'operation') {
        const row = (await query(`SELECT receipt FROM forway_private.operations
          WHERE owner_id = $1 AND operation_id = $2`, [actor, command.operationId])).rows[0];
        result = { receipt: row?.receipt ?? null };
      } else {
        const requestHash = hash(JSON.stringify(command));
        await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`forway-operation:${actor}:${command.operationId}`]);
        const previous = (await query(`SELECT request_hash, receipt FROM forway_private.operations
          WHERE owner_id = $1 AND operation_id = $2`, [actor, command.operationId])).rows[0];
        if (previous) {
          if (previous.request_hash !== requestHash) fail('operation_conflict');
          result = { receipt: previous.receipt };
        } else {
          let row;
          if (command.action === 'create') {
            await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`forway-create:${actor}`]);
            const count = Number((await query(`SELECT count(*) FROM forway_private.workspaces
              WHERE owner_id = $1 AND deleted_at IS NULL`, [actor])).rows[0].count);
            if (count >= 25) fail('workspace_limit');
            row = (await query(`INSERT INTO forway_private.workspaces
              (id, owner_id, title, document_text, content_hash, revision) VALUES ($1,$2,$3,$4,$5,1)
              RETURNING ${fields}`, [randomUUID(), actor, command.title, command.documentText, hash(command.documentText)])).rows[0];
          } else {
            const current = (await query(`SELECT revision FROM forway_private.workspaces
              WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE`, [command.id, actor])).rows[0];
            if (!current) fail('not_found');
            const version = Number(current.revision);
            if (version !== command.expectedRevision) fail('revision_conflict');
            if (version >= Number.MAX_SAFE_INTEGER) fail('revision_limit');
            if (command.action === 'delete') {
              row = (await query(`UPDATE forway_private.workspaces SET title = '', document_text = NULL,
                content_hash = NULL, deleted_at = clock_timestamp(), updated_at = clock_timestamp(), revision = revision + 1
                WHERE id = $1 AND owner_id = $2 RETURNING ${fields}`, [command.id, actor])).rows[0];
            } else {
              row = (await query(`UPDATE forway_private.workspaces SET title = $3, document_text = $4,
                content_hash = $5, updated_at = clock_timestamp(), revision = revision + 1
                WHERE id = $1 AND owner_id = $2 RETURNING ${fields}`,
              [command.id, actor, command.title, command.documentText, hash(command.documentText)])).rows[0];
            }
          }
          result = { receipt: receipt(row) };
          await query(`INSERT INTO forway_private.operations (owner_id, operation_id, request_hash, receipt)
            VALUES ($1,$2,$3,$4::jsonb)`, [actor, command.operationId, requestHash, JSON.stringify(result.receipt)]);
        }
      }
      guard(); commitStarted = true; await query('COMMIT'); begun = false;
      return result;
    } catch (error) {
      if (error instanceof CloudError && !commitStarted) throw error;
      fail(mutating ? 'outcome_unknown' : 'store_unavailable');
    } finally {
      if (begun && !ending && !commitStarted) { try { await client.query('ROLLBACK'); } catch { /* Connection close also aborts the transaction. */ } }
      stop(); await ending;
      signal?.removeEventListener('abort', stop);
      client?.removeListener('error', stop);
    }
  };
}
