const PROVIDERS = Object.freeze({
  openai: 'https://api.openai.com/v1/responses',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models/',
});
export const PROVIDER_LIMITS = Object.freeze({ requestBytes: 16 * 1024, responseBytes: 512 * 1024, milliseconds: 25_000, answerCharacters: 100_000, outputTokens: 2048 });
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { const error = new TypeError('Choose a provider, exact model, ungrounded mode, query and its own API key.'); error.code = 'invalid_provider_request'; throw error; };

export function validateProviderInput(input) {
  if (!object(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) invalid();
  const required = ['provider', 'model', 'mode', 'query', 'apiKey'];
  if (Reflect.ownKeys(input).some(key => !required.includes(key) && key !== 'workspaceId') || required.some(key => !Object.hasOwn(input, key))) invalid();
  for (const key of Reflect.ownKeys(input)) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'string') invalid(); }
  if (!Object.hasOwn(PROVIDERS, input.provider) || input.mode !== 'ungrounded' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.model)
    || input.query.length < 1 || input.query.length > 2000 || !input.query.trim() || !input.query.isWellFormed() || /\0/.test(input.query)
    || !/^[\x21-\x7e]{8,4096}$/.test(input.apiKey)
    || input.workspaceId !== undefined && (input.provider !== 'anthropic' || !/^wrkspc_[a-zA-Z0-9]{10,100}$/.test(input.workspaceId))) invalid();
  return { provider: input.provider, model: input.model, mode: input.mode, query: input.query, apiKey: input.apiKey,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) };
}

function request(input) {
  const { provider, model, query, apiKey } = input;
  const headers = { 'content-type': 'application/json' };
  if (provider === 'openai') return { url: PROVIDERS.openai, headers: { ...headers, authorization: `Bearer ${apiKey}` },
    body: { model, input: query, store: false, max_output_tokens: PROVIDER_LIMITS.outputTokens } };
  if (provider === 'anthropic') return { url: PROVIDERS.anthropic,
    headers: { ...headers, authorization: `Bearer ${apiKey}`, 'anthropic-version': '2026-10-21', ...(input.workspaceId ? { 'anthropic-workspace-id': input.workspaceId } : {}) },
    body: { model, messages: [{ role: 'user', content: query }], max_tokens: PROVIDER_LIMITS.outputTokens } };
  return { url: PROVIDERS.google + encodeURIComponent(model) + ':generateContent',
    headers: { ...headers, 'x-goog-api-key': apiKey, 'x-goog-api-client': 'forway/0.2.0' },
    body: { contents: [{ role: 'user', parts: [{ text: query }] }], generationConfig: { candidateCount: 1, maxOutputTokens: PROVIDER_LIMITS.outputTokens } } };
}
function citations(values) {
  const result = [];
  for (const candidate of values) {
    const raw = candidate?.url ?? candidate?.uri;
    if (typeof raw !== 'string' || raw.length > 2048) continue;
    try { const url = new URL(raw); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      result.push({ url: url.href, title: typeof candidate.title === 'string' ? candidate.title.slice(0, 500) : null }); } catch { /* Unsupported citation; no URL is fetched. */ }
  }
  return [...new Map(result.map(row => [row.url, row])).values()].slice(0, 200);
}
function text(parts) { const result = parts.filter(v => typeof v === 'string').join('\n'); if (result.length > PROVIDER_LIMITS.answerCharacters || !result.isWellFormed()) throw Error('answer_limit'); return result; }
function usage(value) { if (value === undefined || value === null) return null; if (!object(value) || Buffer.byteLength(JSON.stringify(value)) > 8192) throw Error('usage_limit'); return value; }
function parsed(provider, value) {
  if (!object(value)) throw Error('invalid_response');
  if (provider === 'openai') {
    if (!Array.isArray(value.output) || value.output.length > 100) throw Error('invalid_response');
    const content = value.output.filter(item => item?.type === 'message' && item.role === 'assistant').flatMap(item => Array.isArray(item.content) ? item.content : []);
    return { answer: text(content.filter(item => item?.type === 'output_text').map(item => item.text)),
      citations: citations(content.flatMap(item => Array.isArray(item?.annotations) ? item.annotations.filter(a => a?.type === 'url_citation') : [])),
      usage: usage(value.usage), reportedModel: typeof value.model === 'string' ? value.model.slice(0, 200) : null,
      complete: value.status === 'completed' && value.error == null && value.output.every(item => ['message', 'reasoning'].includes(item?.type)) };
  }
  if (provider === 'anthropic') {
    if (!Array.isArray(value.content) || value.content.length > 100) throw Error('invalid_response');
    const parts = value.content.filter(part => part?.type === 'text');
    return { answer: text(parts.map(part => part.text)), citations: citations(parts.flatMap(part => Array.isArray(part.citations) ? part.citations : [])),
      usage: usage(value.usage), reportedModel: typeof value.model === 'string' ? value.model.slice(0, 200) : null,
      complete: value.type === 'message' && value.role === 'assistant' && value.stop_reason === 'end_turn' && value.content.every(part => part?.type === 'text' || part?.type === 'thinking' || part?.type === 'redacted_thinking') };
  }
  if (!Array.isArray(value.candidates) || value.candidates.length !== 1) throw Error('invalid_response');
  const candidate = value.candidates[0];
  if (!Array.isArray(candidate?.content?.parts)) throw Error('invalid_response');
  return { answer: text(candidate.content.parts.filter(part => part?.thought !== true).map(part => part?.text)),
    citations: citations(candidate.citationMetadata?.citationSources ?? []), usage: usage(value.usageMetadata),
    reportedModel: typeof value.modelVersion === 'string' ? value.modelVersion.slice(0, 200) : null,
    complete: candidate.finishReason === 'STOP' && !value.promptFeedback?.blockReason && candidate.content.parts.every(part => typeof part?.text === 'string') && !candidate.groundingMetadata };
}
async function readJSON(response, signal) {
  const reader = response.body?.getReader(); if (!reader) throw Error('missing_response');
  const chunks = []; let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) { if (signal.aborted) throw Error('response_timeout'); const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > PROVIDER_LIMITS.responseBytes) throw Error('response_limit'); chunks.push(chunk.value); }
    if (signal.aborted) throw Error('response_timeout');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** One fixed-origin request only. No environment key, automatic retry or site content. */
export async function queryProvider(value, { fetch: transport = globalThis.fetch, signal: external, now = () => new Date(), timeoutMs = PROVIDER_LIMITS.milliseconds } = {}) {
  const input = validateProviderInput(value), selected = request(input);
  if (typeof transport !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PROVIDER_LIMITS.milliseconds) invalid();
  const signal = external ? AbortSignal.any([external, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const base = { provider: input.provider, model: input.model, mode: input.mode, query: input.query };
  let upstreamStatus = null;
  try {
    if (signal.aborted) throw Error('cancelled');
    const response = await transport(selected.url, { method: 'POST', headers: selected.headers, body: JSON.stringify(selected.body),
      signal, redirect: 'error', cache: 'no-store' });
    upstreamStatus = response.status;
    if (!response.ok) {
      void response.body?.cancel();
      return { ...base, status: response.status >= 400 && response.status < 500 ? 'failed' : 'unknown', reason: 'provider_request_not_completed',
        capturedAt: now().toISOString(), upstreamStatus, answer: '', citations: [], usage: null, reportedModel: null };
    }
    const payload = await readJSON(response, signal);
    if (JSON.stringify(payload).includes(input.apiKey)) throw Error('credential_echo');
    const { complete, ...result } = parsed(input.provider, payload);
    return { ...base, ...result, status: complete && result.answer.trim() ? 'success' : 'unknown',
      reason: complete && result.answer.trim() ? null : 'provider_response_incomplete', upstreamStatus, capturedAt: now().toISOString() };
  } catch {
    return { ...base, status: 'unknown', reason: 'provider_acceptance_or_response_uncertain', capturedAt: now().toISOString(), upstreamStatus,
      answer: '', citations: [], usage: null, reportedModel: null };
  }
}
