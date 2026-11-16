import { normalizeCohort, analyzeObservation } from './observations.mjs';
const providers = ['openai', 'anthropic', 'google'];
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const invalid = () => { throw new TypeError('Review one to five exact queries and one model for each selected API provider.'); };
function fields(value, names) { if (!object(value) || Object.keys(value).length !== names.length || names.some(key => !Object.hasOwn(value, key))) invalid(); }
export function comparisonPlan(value) {
  fields(value, ['cohort', 'queries', 'models']);
  const cohort = normalizeCohort(value.cohort);
  if (!Array.isArray(value.queries) || value.queries.length < 1 || value.queries.length > 5
    || value.queries.some(query => typeof query !== 'string' || !query.trim() || query.length > 2000 || !query.isWellFormed() || query.includes('\0'))
    || new Set(value.queries).size !== value.queries.length || !Array.isArray(value.models) || value.models.length < 1 || value.models.length > 3) invalid();
  for (const row of value.models) { fields(row, ['provider', 'model', 'mode']);
    if (!providers.includes(row.provider) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(row.model) || row.mode !== 'ungrounded') invalid(); }
  if (new Set(value.models.map(row => row.provider)).size !== value.models.length) invalid();
  return { cohort, queries: [...value.queries], models: value.models.map(row => ({ ...row })) };
}
function checkedResult(value, cell) {
  fields(value, ['provider', 'model', 'mode', 'query', 'status', 'reason', 'capturedAt', 'upstreamStatus', 'answer', 'citations', 'usage', 'reportedModel']);
  if (['provider', 'model', 'mode', 'query'].some(key => value[key] !== cell[key]) || !['success', 'failed', 'unknown'].includes(value.status)
    || typeof value.answer !== 'string' || value.answer.length > 100000 || !value.answer.isWellFormed() || value.status === 'success' && !value.answer.trim()
    || typeof value.capturedAt !== 'string' || value.capturedAt.length > 30 || !Number.isFinite(Date.parse(value.capturedAt))
    || value.reason !== null && (typeof value.reason !== 'string' || value.reason.length > 100)
    || value.upstreamStatus !== null && (!Number.isInteger(value.upstreamStatus) || value.upstreamStatus < 100 || value.upstreamStatus > 599)
    || value.reportedModel !== null && (typeof value.reportedModel !== 'string' || value.reportedModel.length > 200)
    || value.usage !== null && (!object(value.usage) || bytes(value.usage) > 8192)
    || !Array.isArray(value.citations) || value.citations.length > 200) invalid();
  for (const citation of value.citations) { fields(citation, ['url', 'title']);
    if (typeof citation.url !== 'string' || citation.url.length > 2048 || citation.title !== null && (typeof citation.title !== 'string' || citation.title.length > 500)) invalid();
    const url = new URL(citation.url); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid(); }
  return structuredClone(value);
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(Error('cancelled')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); signal.aborted ? abort() : resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}
export function createProviderComparison(value, { send, changed = () => {}, now = () => new Date() }) {
  const plan = comparisonPlan(value); if (typeof send !== 'function') invalid();
  const cells = plan.queries.flatMap(query => plan.models.map(model => ({ ...model, query, status: 'pending', reason: null, result: null, startedAt: null, finishedAt: null })));
  let active = null, disposed = false;
  function snapshot() { return structuredClone({ format: 'forway-comparison-v1', plan, cells, source: 'direct_provider_api', grounding: 'no_web_tool_requested' }); }
  function summaries() {
    return plan.models.map(model => {
      const group = cells.filter(cell => cell.provider === model.provider), succeeded = group.filter(cell => cell.status === 'success');
      const observed = succeeded.map(cell => analyzeObservation({ ...plan.cohort, engine: 'API ' + model.provider, prompt: cell.query,
        answer: cell.result.answer, observedAt: cell.result.capturedAt }));
      const brandMentions = observed.filter(row => row.mentions.brand).length;
      const explicitOwnedURLs = observed.filter(row => row.citations.some(citation => citation.owned)).length;
      const nativeOwnedCitations = succeeded.filter(cell => cell.result.citations.some(citation => { const host = new URL(citation.url).hostname; return host === plan.cohort.domain || host.endsWith('.' + plan.cohort.domain); })).length;
      return { ...model, planned: group.length, success: succeeded.length, failed: group.filter(c => c.status === 'failed').length,
        unknown: group.filter(c => c.status === 'unknown').length, pending: group.filter(c => c.status === 'pending').length,
        running: group.filter(c => c.status === 'running').length, brandMentions, explicitOwnedURLs, nativeOwnedCitations,
        successDenominator: succeeded.length, brandRate: succeeded.length ? brandMentions / succeeded.length : null };
    });
  }
  async function run(credentialFor) {
    if (active || disposed) return;
    const controller = new AbortController(); active = controller;
    const timer = setTimeout(() => controller.abort(), 7 * 60_000);
    try {
      for (const cell of cells) {
        if (controller.signal.aborted || disposed) break;
        if (cell.status !== 'pending') continue;
        let credential;
        try { credential = credentialFor(cell.provider); if (!object(credential) || typeof credential.apiKey !== 'string' || !/^[\x21-\x7e]{8,4096}$/.test(credential.apiKey)
          || Object.keys(credential).some(key => !['apiKey', 'workspaceId'].includes(key))) throw Error(); }
        catch { cell.status = 'failed'; cell.reason = 'credential_unavailable_before_dispatch'; changed(snapshot(), summaries()); continue; }
        cell.status = 'running'; cell.startedAt = now().toISOString(); changed(snapshot(), summaries());
        try {
          const payload = { provider: cell.provider, model: cell.model, mode: cell.mode, query: cell.query, apiKey: credential.apiKey,
            ...(credential.workspaceId ? { workspaceId: credential.workspaceId } : {}) };
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]);
          const reply = await abortable(Promise.resolve().then(() => { if (signal.aborted) throw Error(); return send(payload, signal); }), signal);
          if (disposed || controller.signal.aborted) throw Error();
          if (JSON.stringify(reply).includes(credential.apiKey)) throw Error('credential_echo');
          cell.result = checkedResult(reply, cell); cell.status = cell.result.status; cell.reason = cell.result.reason;
        } catch (error) { cell.status = error?.beforeProvider === true ? 'failed' : 'unknown';
          cell.reason = error?.beforeProvider === true ? 'api_rejected_before_provider' : 'acceptance_or_response_uncertain'; cell.result = null; }
        finally { credential = null; cell.finishedAt = now().toISOString(); }
        if (!disposed) changed(snapshot(), summaries());
      }
    } finally { clearTimeout(timer); if (active === controller) active = null; }
  }
  return { run, snapshot, summaries, plan: structuredClone(plan),
    serialize() { const result = JSON.stringify(snapshot(), null, 2) + '\n'; if (new TextEncoder().encode(result).length > 8 * 1024 * 1024) throw Error('Comparison export is too large.'); return result; },
    cancel() { active?.abort(); }, dispose() { disposed = true; active?.abort(); },
  };
}
