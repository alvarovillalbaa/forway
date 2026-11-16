import { queryProvider, validateProviderInput, PROVIDER_LIMITS } from '../src/provider-answer.mjs';
const error = code => { const value = new Error(code); value.code = code; return value; };
async function bounded(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(error('request_timeout')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); signal.aborted ? abort() : resolve(value); }, reason => { signal.removeEventListener('abort', abort); reject(reason); });
    if (signal.aborted) abort();
  });
}
async function input(req, signal) {
  if (typeof req.headers?.['content-type'] !== 'string' || req.headers['content-type'].split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw error('invalid_request');
  const declared = req.headers?.['content-length'];
  if (declared !== undefined && (typeof declared !== 'string' || !/^\d+$/.test(declared) || Number(declared) > PROVIDER_LIMITS.requestBytes)) throw error('request_too_large');
  let value = req.body;
  if (value === undefined) {
    const iterator = req[Symbol.asyncIterator]?.(); if (!iterator) throw error('invalid_request');
    const chunks = []; let bytes = 0;
    try { while (true) { const row = await bounded(iterator.next(), signal); if (row.done) break;
      if (!(row.value instanceof Uint8Array)) throw error('invalid_request'); bytes += row.value.byteLength;
      if (bytes > PROVIDER_LIMITS.requestBytes) throw error('request_too_large'); chunks.push(row.value); }
      value = Buffer.concat(chunks);
    } finally { try { Promise.resolve(iterator.return?.()).catch(() => {}); } catch { /* Bounded handler cleanup. */ } }
  }
  if (typeof value === 'string' || value instanceof Uint8Array) {
    if (Buffer.byteLength(value) > PROVIDER_LIMITS.requestBytes) throw error('request_too_large');
    value = JSON.parse(typeof value === 'string' ? value : new TextDecoder('utf-8', { fatal: true }).decode(value));
  }
  const validated = validateProviderInput(value);
  if (Buffer.byteLength(JSON.stringify(validated)) > PROVIDER_LIMITS.requestBytes) throw error('request_too_large');
  return validated;
}
export function createAnswerHandler({ query = queryProvider } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { if (!res.destroyed && !res.writableEnded) { res.statusCode = status; res.end(JSON.stringify(value)); } };
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
    let dispatched = false;
    const aborted = () => controller.abort(), closed = () => { if (!res.writableEnded) controller.abort(); };
    req.once?.('aborted', aborted); res.once?.('close', closed);
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); send(405, { error: { code: 'unsupported_method', message: 'Use POST for one reviewed provider query.' } }); return; }
      let origin; try { origin = new URL(req.headers?.origin); } catch { throw error('foreign_origin'); }
      const protocol = process.env.VERCEL === '1' || req.socket?.encrypted ? 'https:' : 'http:';
      if (origin.origin !== `${protocol}//${req.headers.host}` || req.headers['sec-fetch-site'] === 'cross-site') throw error('foreign_origin');
      const readSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
      const value = await bounded(input(req, readSignal), readSignal);
      if (controller.signal.aborted) throw error('request_timeout');
      dispatched = true;
      const result = await bounded(query(value, { signal: controller.signal }), controller.signal);
      send(200, { result });
    } catch (failure) {
      const code = ['foreign_origin', 'request_too_large', 'request_timeout'].includes(failure?.code) ? failure.code : dispatched ? 'provider_uncertain' : 'invalid_request';
      send(code === 'foreign_origin' ? 403 : code === 'request_too_large' ? 413 : code === 'request_timeout' ? 504 : code === 'provider_uncertain' ? 502 : 400,
        { error: { code, message: code === 'foreign_origin' ? 'Open provider queries directly in Forway.' : 'This provider request could not be completed. Acceptance may be uncertain; do not retry automatically.' } });
    } finally { clearTimeout(timer); req.removeListener?.('aborted', aborted); res.removeListener?.('close', closed); }
  };
}
export default createAnswerHandler();
