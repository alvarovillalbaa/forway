import { analyzeHtml } from './audit.mjs';
import { analyzeAgentSource } from './agent-source.mjs';
import { createSiteCrawler, CRAWL_LIMITS } from './crawl.mjs';
import { createProviderComparison, comparisonPlan } from './provider-comparison.mjs';
import { buildSiteReport } from './site-report.mjs';
import { renderSiteReport } from './report-view.mjs';
import { el, replace, action, downloadText, formatDate } from './ui.mjs';
const $ = id => document.getElementById(id);

export function inspectCrawlPage(page) {
  const source = { url: page.url, html: page.html, headers: page.headers };
  const audit = analyzeHtml(source), agent = analyzeAgentSource(source);
  const template = document.createElement('template'); template.innerHTML = page.html;
  let base = page.url;
  const declared = template.content.querySelector('base[href]')?.getAttribute('href');
  if (declared) { try { const url = new URL(declared, page.url); if (url.hostname === new URL(page.url).hostname && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.port) base = url.href; } catch { /* Keep captured URL. */ } }
  const links = [...template.content.querySelectorAll('a[href]')].map(node => {
    try { return new URL(node.getAttribute('href'), base).href; } catch { return node.getAttribute('href') ?? ''; }
  });
  return { facts: audit.facts, agentFacts: agent.facts, links };
}
async function rpc(path, body, signal, limit) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  const reader = response.body?.getReader(); if (!reader) throw Error('Missing API response');
  const chunks = []; let count = 0;
  try { for (;;) { const row = await reader.read(); if (row.done) break; count += row.value.byteLength;
      if (count > limit || signal.aborted) throw Error('API response limit'); chunks.push(row.value); }
    if (signal.aborted) throw Error('API request cancelled');
    const bytes = new Uint8Array(count); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!response.ok) { const error = new Error('API request was not completed'); error.code = value?.error?.code;
      error.beforeProvider = path === '/api/answer' && [400, 403, 413].includes(response.status) && ['invalid_request', 'foreign_origin', 'request_too_large'].includes(error.code); throw error; }
    return value;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const explanations = {
  not_started: 'Ready to start.', request_limit: 'This batch reached its request limit. Resume to continue.',
  byte_limit: 'This batch reached its download limit. Resume to continue.', time_limit: 'This batch reached its time limit. Resume to continue.',
  page_limit: 'The captured-page capacity is reached. Export this crawl before choosing another scope.',
  storage_limit: 'The crawl-state capacity is reached. Export captured sources and the remaining frontier.',
  robots_unreachable: 'Robots policy could not be verified. Pending pages were kept; resume to check again.',
  robots_unreadable: 'Robots policy could not be read. No permission was inferred.',
  imported_resume: 'Imported source is supplied evidence. Robots policies will be fetched again on resume.',
};

export function createSiteTools({ notice, confirm, changed, observations, editCapturedPage, openEvidence }) {
  let crawler = null, comparison = null, crawlEpoch = 0, compareEpoch = 0, readEpoch = 0;
  let crawlBusy = false, compareBusy = false, crawlDirty = false, compareDirty = false, compareDraftDirty = false, reviewCurrent = false;
  const providerRows = [...document.querySelectorAll('[data-provider]')];
  const clearKeys = () => { for (const row of providerRows) { row.querySelector('[data-field="key"]').value = ''; const workspace = row.querySelector('[data-field="workspace"]'); if (workspace) workspace.value = ''; } };
  function renderCrawlStatus(summary) {
    $('crawl-status').textContent = `${summary.hostname} · ${summary.done} analyzed / ${summary.discovered} discovered page URLs · ${summary.pending} pending · ${summary.refused} refused · ${summary.failed} failed · ${summary.redirected} redirected aliases. ${summary.pendingDocuments} sitemap documents and ${summary.pendingExpansions} source expansions remain. ${summary.state === 'frontier_exhausted' ? 'Discoverable frontier drained; every page on the domain is not established.' : explanations[summary.reason] ?? (summary.state === 'running' ? 'Discovery is running.' : 'Discovery stopped; pending work is retained.')}${summary.batch ? ` Batch: ${summary.batch.chargedRequests}/${summary.limits.requests} charged requests, ${summary.batch.responseBytes} observed bytes (${summary.batch.chargedBytes} bytes charged to the limit).` : ''}`;
    $('crawl-resume').disabled = crawlBusy || summary.state === 'frontier_exhausted'; $('crawl-stop').disabled = !crawlBusy; $('crawl-save').disabled = false;
  }
  function renderCrawl() {
    if (!crawler) return;
    const captured = crawler, epoch = crawlEpoch, summary = crawler.summary(), state = crawler.snapshot();
    renderCrawlStatus(summary);
    replace($('crawl-ledger'), el('pre', {}, JSON.stringify({ pages: state.rows, remainingDocuments: state.frontier,
      unexpandedSources: state.expansions.map(({ url, kind, index }) => ({ url, kind, nextCandidateIndex: index })), documents: state.documents }, null, 2)));
    const sources = crawler.sources(); $('crawl-report').hidden = false;
    if (!sources.length) { replace($('crawl-report'), el('p', { className: 'unmeasured' }, 'No page was successfully audited. Source checks remain unmeasured; refusals, failures and pending URLs are shown above.')); return; }
    const report = buildSiteReport({ pages: sources, observations: observations(), coverage: { scope: 'site', state: summary.state,
      discovered: summary.discovered, remaining: summary.pending, refused: summary.refused, failed: summary.failed, redirected: summary.redirected } });
    renderSiteReport($('crawl-report'), report, { notice, idPrefix: 'crawl-', evidence: openEvidence,
      edit: () => editCapturedPage(captured.snapshot().pages[0]), current: () => captured === crawler && epoch === crawlEpoch });
  }
  async function runCrawl() {
    if (!crawler || crawlBusy) return;
    const captured = crawler, epoch = crawlEpoch; crawlBusy = true; renderCrawlStatus(crawler.summary());
    try { await captured.run(); }
    finally { if (captured === crawler && epoch === crawlEpoch) { crawlBusy = false; crawlDirty = true; changed(); renderCrawl(); } }
  }
  function candidate(seed, epoch) {
    let instance;
    instance = createSiteCrawler(seed, {
      getDocument: async (input, signal) => (await rpc('/api/crawl', input, signal, 8 * 1024 * 1024)).document,
      inspectPage: inspectCrawlPage,
      progress(summary) { if (crawler === instance && epoch === crawlEpoch) renderCrawlStatus(summary); },
    }); return instance;
  }
  async function start(url) {
    try {
      if (crawler && !await confirm('Replace this website crawl?', 'Export the captured HTML and pending frontier first if you need this crawl. Page/draft work and API comparisons are kept.', 'Start a new crawl')) return;
      const epoch = crawlEpoch + 1, next = candidate(url, epoch);
      crawler?.dispose(); crawlEpoch = epoch; readEpoch++; crawler = next; crawlBusy = false; crawlDirty = true; changed();
      $('crawl-report').hidden = true; replace($('crawl-ledger')); await runCrawl();
    } catch { notice('Website discovery could not start. Use a complete HTTP(S) URL without credentials or a nonstandard port. Current work was kept.', true); }
  }
  $('crawl-resume').addEventListener('click', () => { void runCrawl().catch(() => notice('Crawl report could not be rendered. Captured sources are kept; save the crawl for recovery.', true)); });
  $('crawl-stop').addEventListener('click', () => crawler?.cancel());
  $('crawl-save').addEventListener('click', () => { try { if (!crawler) return; downloadText('forway-crawl.json', crawler.serialize(), 'application/json'); crawlDirty = false; changed(); notice('Crawl JSON prepared, including sources, refusals and pending work. Imported receipts are supplied evidence.'); } catch { notice('Crawl export could not be prepared. The current crawl remains in this tab.', true); } });
  $('crawl-open').addEventListener('click', () => $('crawl-file').click());
  $('crawl-file').addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
    const read = ++readEpoch;
    try {
      if (file.size > CRAWL_LIMITS.exportBytes) throw Error();
      if (crawler && !await confirm('Replace this website crawl?', 'The file replaces only the current crawl. Export it first to keep your current captured sources and frontier.', 'Open crawl')) return;
      const raw = await file.text(); if (read !== readEpoch) return;
      const parsed = JSON.parse(raw), epoch = crawlEpoch + 1, next = candidate(parsed.seed, epoch); next.restore(raw);
      if (read !== readEpoch) { next.dispose(); return; }
      crawler?.dispose(); crawlEpoch = epoch; crawler = next; crawlBusy = false; crawlDirty = false;
      $('page-url').value = parsed.seed; $('analysis-scope').value = 'site'; $('analysis-scope').dispatchEvent(new Event('change'));
      changed(); renderCrawl(); notice('Crawl opened without contacting the site. Captured sources are supplied evidence; Resume checks policies again.');
    } catch { notice('This crawl file could not be opened. The current crawl was kept.', true); }
  });
  function providerToggle(row) {
    const selected = row.querySelector('[data-field="selected"]').checked;
    for (const input of row.querySelectorAll('input:not([type="checkbox"])')) input.disabled = !selected || compareBusy;
    if (!selected) { row.querySelector('[data-field="key"]').value = ''; const workspace = row.querySelector('[data-field="workspace"]'); if (workspace) workspace.value = ''; }
  }
  function invalidateReview(event) {
    if (['key', 'workspace'].includes(event?.target?.dataset?.field)) return;
    compareDraftDirty = true; changed();
    reviewCurrent = false; $('provider-run').disabled = true; $('provider-confirm').checked = false;
    if (comparison) $('provider-status').textContent = 'Inputs changed. Earlier results are retained; prepare a new review before running.';
  }
  for (const row of providerRows) { row.querySelector('[data-field="selected"]').addEventListener('change', () => { providerToggle(row); invalidateReview(); }); providerToggle(row); }
  $('provider-form').addEventListener('input', invalidateReview);
  $('provider-clear').addEventListener('click', () => { clearKeys(); notice('API key fields cleared. No keys are included in exports.'); });
  function readPlan() {
    return comparisonPlan({ cohort: { brand: $('comparison-brand').value.trim(), domain: $('comparison-domain').value.trim(),
      competitors: $('comparison-competitors').value.split(/\r?\n/).map(v => v.trim()).filter(Boolean) },
    queries: $('comparison-queries').value.split(/\r?\n/).filter(v => v.trim()),
    models: providerRows.filter(row => row.querySelector('[data-field="selected"]').checked).map(row => ({ provider: row.dataset.provider,
      model: row.querySelector('[data-field="model"]').value.trim(), mode: 'ungrounded' })) });
  }
  function renderComparison(snapshot, summaries) {
    const total = status => snapshot.cells.filter(cell => cell.status === status).length;
    $('provider-status').textContent = `${total('success')} successful / ${snapshot.cells.length} planned · ${total('failed')} failed · ${total('unknown')} unknown · ${total('pending')} not started · ${total('running')} running. Missing or uncertain answers are not zero visibility.`;
    replace($('provider-results'),
      el('div', { className: 'provider-summary' }, summaries.map(row => el('article', {}, el('h3', {}, row.provider + ' · ' + row.model),
        el('p', {}, `${row.success}/${row.planned} successful; ${row.failed} failed; ${row.unknown} unknown; ${row.pending} pending.`),
        el('p', {}, row.successDenominator ? `${row.brandMentions}/${row.successDenominator} successful answers mention the brand; ${row.explicitOwnedURLs}/${row.successDenominator} have an owned URL in answer text; ${row.nativeOwnedCitations}/${row.successDenominator} have an owned URL in native citation metadata.` : 'Brand/citation rates: unmeasured. No successful answer denominator.'),
        el('small', {}, 'This reviewed API query cohort only; no representative consumer-product visibility claim.')))),
      snapshot.cells.map(cell => el('details', { className: 'api-answer' }, el('summary', {}, `${cell.provider} · ${cell.model} · ${cell.status}`),
        el('h4', {}, 'Exact query'), el('pre', {}, cell.query),
        el('p', {}, cell.result ? `Captured ${formatDate(cell.result.capturedAt)} · reported model: ${cell.result.reportedModel ?? 'not supplied'}` : cell.reason ?? 'Not requested yet.'),
        cell.result?.answer ? el('blockquote', {}, cell.result.answer) : null,
        cell.result ? el('pre', {}, JSON.stringify({ nativeCitations: cell.result.citations, nativeUsage: cell.result.usage,
          upstreamStatus: cell.result.upstreamStatus, status: cell.status, reason: cell.reason }, null, 2)) : null)));
    $('provider-save').disabled = false;
  }
  $('provider-form').addEventListener('submit', async event => {
    event.preventDefault(); if (compareBusy) return;
    try {
      const plan = readPlan();
      if (comparison && !await confirm('Replace this API comparison?', 'Export the original answers and metadata first if you need this comparison. Keys are never included.', 'Prepare new comparison')) return;
      comparison?.dispose(); const epoch = ++compareEpoch;
      let instance;
      instance = createProviderComparison(plan, { send: async (input, signal) => (await rpc('/api/answer', input, signal, 2 * 1024 * 1024)).result,
        changed(snapshot, summaries) { if (comparison === instance && epoch === compareEpoch) { compareDirty = true; changed(); renderComparison(snapshot, summaries); } } });
      comparison = instance; compareDirty = true; compareDraftDirty = false; reviewCurrent = true;
      $('provider-plan').textContent = JSON.stringify(plan, null, 2); $('provider-review').hidden = false; $('provider-confirm').checked = false;
      $('provider-run').disabled = true; renderComparison(comparison.snapshot(), comparison.summaries()); changed();
      notice('Review the exact queries and models above. Preparing this comparison made no provider request.');
    } catch { notice('Review the brand/domain, up to20 unique competitor names, one to5 unique queries and one exact model per selected provider. No provider was called.', true); }
  });
  $('provider-confirm').addEventListener('change', () => { $('provider-run').disabled = compareBusy || !comparison || !reviewCurrent || !$('provider-confirm').checked; });
  $('provider-run').addEventListener('click', async () => {
    if (!comparison || !reviewCurrent || !$('provider-confirm').checked || compareBusy) return;
    const captured = comparison, epoch = compareEpoch;
    const selected = providerRows.filter(row => captured.plan.models.some(model => model.provider === row.dataset.provider));
    if (selected.some(row => !/^[\x21-\x7e]{8,4096}$/.test(row.querySelector('[data-field="key"]').value))) { notice('Enter each selected provider’s own API key before running. No deployment key is used.', true); return; }
    compareBusy = true; $('provider-run').disabled = true; $('provider-stop').disabled = false;
    for (const input of $('provider-form').querySelectorAll('input,textarea,button')) input.disabled = true;
    try { await captured.run(provider => { const row = selected.find(row => row.dataset.provider === provider); const workspaceId = row.querySelector('[data-field="workspace"]')?.value;
      return { apiKey: row.querySelector('[data-field="key"]').value, ...(workspaceId ? { workspaceId } : {}) }; }); }
    catch { notice('The comparison stopped. Keep its results; unknown acceptance is not retried automatically.', true); }
    finally { clearKeys(); if (captured === comparison && epoch === compareEpoch) {
      compareBusy = false; $('provider-stop').disabled = true; $('provider-confirm').checked = false;
      for (const input of $('provider-form').querySelectorAll('input,textarea,button')) input.disabled = false;
      providerRows.forEach(providerToggle); renderComparison(captured.snapshot(), captured.summaries());
      $('provider-run').textContent = 'Run remaining reviewed queries'; $('provider-run').disabled = true;
    } }
  });
  $('provider-stop').addEventListener('click', () => comparison?.cancel());
  $('provider-save').addEventListener('click', () => { try { if (!comparison) return; downloadText('forway-api-comparison.json', comparison.serialize(), 'application/json'); compareDirty = false; changed(); notice('API answers and native metadata prepared for download. No keys are included.'); } catch { notice('The API comparison could not be exported. Results remain in this tab.', true); } });
  function reset() {
    crawlEpoch++; compareEpoch++; readEpoch++; crawler?.dispose(); comparison?.dispose(); crawler = comparison = null;
    crawlBusy = compareBusy = crawlDirty = compareDirty = compareDraftDirty = reviewCurrent = false; clearKeys();
    for (const input of $('provider-form').querySelectorAll('input,textarea,button')) input.disabled = false;
    $('provider-form').reset(); providerRows.forEach(providerToggle);
    $('provider-run').textContent = 'Run reviewed comparison'; $('provider-run').disabled = $('provider-stop').disabled = $('provider-save').disabled = true; $('provider-confirm').checked = false;
    $('provider-review').hidden = true; replace($('provider-results')); replace($('crawl-report')); replace($('crawl-ledger'));
    $('crawl-report').hidden = true; $('crawl-save').disabled = $('crawl-stop').disabled = $('crawl-resume').disabled = true;
    $('crawl-status').textContent = 'Enter a URL to start. No site has been contacted.'; $('provider-status').textContent = 'No provider has been queried.';
  }
  function hide() { crawler?.cancel(); comparison?.cancel(); clearKeys(); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide(); });
  return { start, reset, cancelCrawl: () => { readEpoch++; crawler?.cancel(); }, hide,
    hasCrawl: () => Boolean(crawler),
    hasWork: () => Boolean(crawler || comparison || compareDraftDirty || providerRows.some(row => row.querySelector('[data-field="key"]').value)),
    hasUnsaved: () => crawlDirty || compareDirty || compareDraftDirty,
    dispose() { hide(); crawler?.dispose(); comparison?.dispose(); crawlEpoch++; compareEpoch++; readEpoch++; },
  };
}
