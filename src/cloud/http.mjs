import { CloudError, fail } from './commands.mjs';
export const SAFE = Object.freeze({
  invalid_request: [400, 'The request is invalid.'], invalid_workspace: [400, 'This workspace is invalid. Your local work has been kept.'],
  unsupported_method: [405, 'Use POST.'], unsupported_media_type: [415, 'Send application/json.'],
  body_too_large: [413, 'The workspace request is too large.'], origin_refused: [403, 'Open the configured Forway app to continue.'],
  sign_in_required: [401, 'Sign in with a confirmed email to continue.'],
  not_found: [404, 'This workspace is unavailable.'], revision_conflict: [409, 'A newer version exists. Reopen it or save your work as a new workspace.'],
  operation_conflict: [409, 'This request ID belongs to a different save.'], revision_limit: [409, 'Save this work as a new workspace.'],
  workspace_limit: [409, 'Your account has 25 saved workspaces. Delete one before creating another.'],
  outcome_unknown: [503, 'The result could not be confirmed. Keep this request and check its receipt before making a new save.'],
  store_unavailable: [503, 'Saved workspaces are temporarily unavailable. Your local work has been kept.'],
  cloud_unavailable: [503, 'Account storage is not configured yet. You can keep working and export a file.'],
  auth_unavailable: [503, 'The account service is temporarily unavailable.'], email_unavailable: [503, 'Email signup and recovery are not available yet.'],
  rate_limited: [429, 'Too many account requests. Please wait before trying again.'],
});
function aborted(signal) { if (signal.aborted) fail('store_unavailable'); }
function next(iterator, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => { signal.removeEventListener('abort', stop); reject(new CloudError('store_unavailable')); };
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(() => iterator.next()).then(value => {
      signal.removeEventListener('abort', stop); signal.aborted ? stop() : resolve(value);
    }, error => { signal.removeEventListener('abort', stop); reject(error); });
    if (signal.aborted) stop();
  });
}
async function read(req, signal, maxBytes) {
  if (typeof req.headers?.['content-type'] !== 'string'
    || req.headers['content-type'].split(';')[0].trim().toLowerCase() !== 'application/json') fail('unsupported_media_type');
  const length = req.headers['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length))) fail('invalid_request');
  if (length !== undefined && (!Number.isSafeInteger(Number(length)) || Number(length) > maxBytes)) fail('body_too_large');
  let body = req.body;
  if (body === undefined) {
    const iterator = req[Symbol.asyncIterator]?.(); if (!iterator) fail('invalid_request');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const part = await next(iterator, signal); if (part.done) break;
        if (!(part.value instanceof Uint8Array)) fail('invalid_request');
        size += part.value.byteLength; if (size > maxBytes) fail('body_too_large');
        chunks.push(Buffer.from(part.value));
      }
      body = Buffer.concat(chunks, size);
    } finally { try { Promise.resolve(iterator.return?.()).catch(() => {}); } catch { /* No unbounded cleanup. */ } }
  }
  try {
    if (body instanceof Uint8Array) {
      if (body.byteLength > maxBytes) fail('body_too_large');
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } else if (typeof body === 'string') {
      if (Buffer.byteLength(body) > maxBytes) fail('body_too_large'); body = JSON.parse(body);
    }
    if (Buffer.byteLength(JSON.stringify(body)) > maxBytes) fail('body_too_large');
    return body;
  } catch (error) { if (error instanceof CloudError) throw error; fail('invalid_request'); }
}
export function createJsonHandler({ config, execute, maxBytes = 4198400 }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Vary', 'Origin');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    const stop = () => controller.abort(), closed = () => { if (!res.writableEnded) stop(); };
    req.once?.('aborted', stop); res.once?.('close', closed);
    const send = (status, value) => { if (!res.destroyed && !res.writableEnded) { res.statusCode = status; res.end(JSON.stringify(value)); } };
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); fail('unsupported_method'); }
      const settings = config();
      if (req.headers?.origin !== settings.appOrigin || (req.headers['sec-fetch-site']
        && req.headers['sec-fetch-site'] !== 'same-origin')) fail('origin_refused');
      const input = await read(req, controller.signal, maxBytes); aborted(controller.signal);
      const result = await execute(input, req.headers, settings, controller.signal);
      send(200, result);
    } catch (error) {
      const code = error instanceof CloudError && Object.hasOwn(SAFE, error.code) ? error.code : 'store_unavailable';
      const [status, message] = SAFE[code]; send(status, { error: { code, message } });
    } finally { clearTimeout(timer); req.removeListener?.('aborted', stop); res.removeListener?.('close', closed); }
  };
}
