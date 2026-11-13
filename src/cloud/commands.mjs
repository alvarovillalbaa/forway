import { serializeWorkspace } from '../../public/src/workspace.mjs';

export class CloudError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function fail(code) { throw new CloudError(code); }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('invalid_request');
  return value.toLowerCase();
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid_request');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) fail('invalid_request');
  for (const key of own) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d.enumerable || !Object.hasOwn(d, 'value')) fail('invalid_request');
  }
}
export function normalizeCommand(input) {
  const action = Object.getOwnPropertyDescriptor(input ?? {}, 'action')?.value;
  const keys = {
    list: ['action'], get: ['action', 'id'], operation: ['action', 'operationId'],
    create: ['action', 'operationId', 'title', 'workspace'],
    save: ['action', 'operationId', 'id', 'expectedRevision', 'title', 'workspace'],
    delete: ['action', 'operationId', 'id', 'expectedRevision'],
  };
  if (typeof action !== 'string' || !Object.hasOwn(keys, action)) fail('invalid_request');
  record(input, keys[action]);
  const value = { action };
  if (Object.hasOwn(input, 'id')) value.id = uuid(input.id);
  if (Object.hasOwn(input, 'operationId')) value.operationId = uuid(input.operationId);
  if (Object.hasOwn(input, 'expectedRevision')) {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) fail('invalid_request');
    value.expectedRevision = input.expectedRevision;
  }
  if (Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120
      || /[\u0000-\u001f\u007f]/.test(input.title) || !input.title.isWellFormed()) fail('invalid_request');
    value.title = input.title.trim();
    try { value.documentText = serializeWorkspace(input.workspace); }
    catch { fail('invalid_workspace'); }
  }
  return Object.freeze(value);
}
