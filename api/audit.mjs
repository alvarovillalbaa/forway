import { fetchPublicPage, PageImportError, validatePageImportInput } from '../src/fetch-page.mjs';

const MAX_BODY = 4096;
const SAFE = Object.freeze({
  invalid_request: [400, 'Send one JSON object containing only a URL.'],
  body_too_large: [413, 'The import request exceeds four KiB.'],
  unsupported_method: [405, 'Use POST to import a public page.'],
  unsupported_media_type: [415, 'Send the request as application/json.'],
  fetch_timeout: [504, 'The page import exceeded its time limit or was cancelled.'],
  fetch_failed: [502, 'The public page could not be retrieved.'],
});
function failure(code) { const error = new Error(code); error.apiCode = code; return error; }
function race(promise, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => { dispose(); reject(failure('fetch_timeout')); };
    const dispose = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(value => { dispose(); signal.aborted ? aborted() : resolve(value); },
      error => { dispose(); reject(error); });
    if (signal.aborted) aborted();
  });
}
async function readInput(req, signal) {
  const type = req.headers?.['content-type'];
  if (typeof type !== 'string' || type.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw failure('unsupported_media_type');
  const length = req.headers?.['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^[0-9]+$/.test(length))) throw failure('invalid_request');
  if (length !== undefined && (!Number.isSafeInteger(Number(length)) || Number(length) > MAX_BODY)) throw failure('body_too_large');
  let body = req.body;
  if (body === undefined) {
    const iterator = req[Symbol.asyncIterator]?.();
    if (!iterator) throw failure('invalid_request');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const next = await race(iterator.next(), signal); if (next.done) break;
        if (!(next.value instanceof Uint8Array)) throw failure('invalid_request');
        size += next.value.byteLength; if (size > MAX_BODY) throw failure('body_too_large');
        chunks.push(Buffer.from(next.value));
      }
    } finally { try { Promise.resolve(iterator.return?.()).catch(() => {}); } catch { /* No unbounded cleanup wait. */ } }
    body = Buffer.concat(chunks, size);
  }
  try {
    if (body instanceof Uint8Array) {
      if (body.byteLength > MAX_BODY) throw failure('body_too_large');
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } else if (typeof body === 'string') {
      if (Buffer.byteLength(body) > MAX_BODY) throw failure('body_too_large');
      body = JSON.parse(body);
    }
    const input = validatePageImportInput(body);
    if (Buffer.byteLength(JSON.stringify(input)) > MAX_BODY) throw failure('body_too_large');
    return input;
  } catch (error) {
    if (error?.apiCode === 'body_too_large') throw error;
    throw failure('invalid_request');
  }
}

export function createAuditHandler({ fetchPage = fetchPublicPage, timeoutMs = 8000 } = {}) {
  if (typeof fetchPage !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw failure('invalid_request');
  return async function audit(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const aborted = () => controller.abort();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    req.once?.('aborted', aborted);
    res.once?.('close', closed);
    const send = (status, value) => { if (!res.destroyed && !res.writableEnded) { res.statusCode = status; res.end(JSON.stringify(value)); } };
    const guard = () => {
      if (performance.now() >= deadline) controller.abort();
      if (controller.signal.aborted) throw failure('fetch_timeout');
    };
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw failure('unsupported_method'); }
      const input = await race(readInput(req, controller.signal), controller.signal);
      guard();
      const page = await race(Promise.resolve().then(() => { guard(); return fetchPage(input, { signal: controller.signal }); }), controller.signal);
      guard();
      send(200, { page });
    } catch (error) {
      let code = 'fetch_failed', status = SAFE.fetch_failed[0], message = SAFE.fetch_failed[1];
      try {
        if (error instanceof PageImportError) {
          const safe = new PageImportError(error.code); code = safe.code; status = safe.status; message = safe.message;
        } else if (typeof error?.apiCode === 'string' && Object.hasOwn(SAFE, error.apiCode)) {
          code = error.apiCode; [status, message] = SAFE[code];
        }
      } catch { /* Do not inspect or expose opaque exception fields. */ }
      send(status, { error: { code, message } });
    } finally { clearTimeout(timer); req.removeListener?.('aborted', aborted); res.removeListener?.('close', closed); }
  };
}
export default createAuditHandler();
