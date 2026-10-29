import { analyzeHtml } from './audit.mjs';
import { normalizeDraft, createHtml, createMetadata } from './content.mjs';
import { normalizeObservation, analyzeObservation, summarizeObservations, observationCohortKey } from './observations.mjs';
import { parseWorkspace, serializeWorkspace } from './workspace.mjs';
import { el, replace, action, formatDate, downloadText } from './ui.mjs';

const $ = id => document.getElementById(id);
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;
const emptyDraft = () => ({ url: '', title: '', description: '', heading: '', summary: '', body: '', questions: [], sources: [] });
const copy = value => structuredClone(value);
let workspace = { version: 1, source: null, draft: null, observations: [] };
let report = null, comparison = null, sourceReceipt = null;
let revision = 0, exportedRevision = 0, pendingRead = null, confirmation = null, disposed = false;
let intakeChanged = false, evidenceChanged = false, cohort = '', auditFilter = 'all';
const titles = {
  audit: ['01 / Inspect', ['A good page starts', 'with a clear picture.'], 'Check the source. Find the gaps. Give your next edit a purpose.'],
  content: ['02 / Create & improve', ['A useful answer.', 'In your own words.'], 'Turn findings into a page you can review, improve and take with you.'],
  evidence: ['03 / Observe', ['The answer is', 'in the evidence.'], 'Keep supplied AI answers, their context and their actual citations together.'],
};

function showNotice(message, error = false) {
  $('app-notice').hidden = false;
  $('app-notice').classList.toggle('error', error);
  $('app-notice-text').setAttribute('role', error ? 'alert' : 'status');
  $('app-notice-text').setAttribute('aria-live', error ? 'assertive' : 'polite');
  $('app-notice-text').textContent = message;
}

function updateMemoryLabel() {
  $('workspace-state').textContent = revision === exportedRevision ? 'Export to keep your next changes' : 'Changes stay in this tab';
}

function endRead(operation) {
  if (operation.timer) clearTimeout(operation.timer);
  if (pendingRead !== operation) return;
  pendingRead = null;
  $('import-progress').hidden = true;
  $('main').removeAttribute('aria-busy');
}

function cancelRead(message) {
  const operation = pendingRead;
  if (!operation) return;
  endRead(operation);
  operation.controller.abort();
  if (message) showNotice(message);
}

function touch({ draft = false } = {}) {
  revision++;
  cancelRead('Import canceled because the workspace changed. Your edits were kept.');
  if (draft) {
    comparison = null;
    $('artifact-review').hidden = true;
    renderComparison();
  }
  updateMemoryLabel();
}

function hasDraft() {
  const draft = workspace.draft;
  return draft && (['url', 'title', 'description', 'heading', 'summary', 'body'].some(key => draft[key].length)
    || draft.questions.length || draft.sources.length);
}

function hasWork() {
  return Boolean(workspace.source || hasDraft() || workspace.observations.length || intakeChanged || evidenceChanged);
}

function confirmReplace(title, description, label = 'Replace') {
  const dialog = $('confirm-dialog');
  if (confirmation || dialog.open) return Promise.resolve(false);
  $('confirm-title').textContent = title;
  $('confirm-description').textContent = description;
  $('confirm-action').textContent = label;
  dialog.returnValue = '';
  return new Promise(resolve => {
    confirmation = resolve;
    dialog.showModal();
  });
}

$('confirm-dialog').addEventListener('close', () => {
  const resolve = confirmation;
  confirmation = null;
  resolve?.($('confirm-dialog').returnValue === 'confirm');
});

function navigate(view, focus = true) {
  if (!Object.hasOwn(titles, view)) return;
  for (const key of Object.keys(titles)) $('view-' + key).hidden = key !== view;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const [eyebrow, lines, intro] = titles[view];
  $('page-eyebrow').textContent = eyebrow;
  replace($('page-title'), document.createTextNode(lines[0]), el('br'), document.createTextNode(lines[1]));
  $('page-intro').textContent = intro;
  history.replaceState(null, '', '#' + view);
  if (focus) $('main').focus({ preventScroll: false });
}

function live(operation) {
  if (disposed || pendingRead !== operation || operation.revision !== revision || operation.controller.signal.aborted) return false;
  if (operation.deadline !== null && performance.now() >= operation.deadline) {
    endRead(operation); operation.controller.abort();
    showNotice('The import took too long. Your current workspace was kept. Try again or supply HTML instead.', true);
    return false;
  }
  return true;
}

async function importOperation({ label, replacement, load, commit }) {
  cancelRead();
  const operation = { controller: new AbortController(), revision, timer: null, deadline: null };
  pendingRead = operation;
  if (replacement && hasWork()) {
    const accepted = await confirmReplace(replacement.title, replacement.detail, replacement.label);
    if (!live(operation)) return;
    if (!accepted) { endRead(operation); return; }
  }
  if (!live(operation)) return;
  operation.deadline = performance.now() + 15000;
  operation.timer = setTimeout(() => {
    if (pendingRead !== operation) return;
    endRead(operation); operation.controller.abort();
    showNotice('The import took too long. Your current workspace was kept. Try again or supply HTML instead.', true);
  }, 15000);
  $('import-progress').hidden = false;
  $('import-progress-text').textContent = label;
  $('main').setAttribute('aria-busy', 'true');
  try {
    const value = await load(operation.controller.signal);
    if (!live(operation)) return;
    commit(value);
    endRead(operation);
    revision++;
    updateMemoryLabel();
  } catch (error) {
    if (!live(operation)) return;
    endRead(operation);
    const code = error && typeof error === 'object' ? error.code : '';
    const messages = {
      invalid_workspace: 'This workspace could not be opened. It may be incomplete, unsupported or over 4 MiB. Your current work was kept.',
      invalid_url: 'Use a public HTTP or HTTPS page URL without credentials or a nonstandard port.',
      url_not_public: 'Only public Internet pages can be imported by URL. Supply the page HTML instead.',
      fetch_timeout: 'The page did not respond in time. Try again or supply its HTML.',
      response_too_large: 'The page exceeded the import limit. Supply a smaller HTML document (up to 1 MiB).',
      unsupported_content: 'The URL did not return a successful HTML page. Supply its HTML source instead.',
      unsupported_encoding: 'The page did not return uncompressed UTF-8 HTML. Supply a UTF-8 HTML file or paste its source instead.',
      invalid_utf8: 'The page did not contain valid UTF-8 HTML. Supply a UTF-8 HTML file or paste valid source instead.',
      invalid_html_file: 'Choose a locally available UTF-8 HTML or text file, up to 1 MiB. Your current work was kept.',
    };
    showNotice(messages[code] ?? 'The source could not be imported or analyzed. Check the URL/file and try again, or paste valid HTML. Your current work was kept.', true);
  }
}

function checkedBytes(text, maximum, code) {
  if (typeof text !== 'string' || text.length > maximum || new TextEncoder().encode(text).length > maximum) throw { code };
  return text;
}

async function readFile(file, maximum, code) {
  if (!file || file.size > maximum) throw { code };
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > maximum) throw { code };
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw { code }; }
}

async function readApiResponse(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw { code: 'invalid_response' };
  const parts = []; let size = 0;
  try {
    for (;;) {
      if (signal.aborted) throw { code: 'request_cancelled' };
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) throw { code: 'response_too_large' };
      parts.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { try { await reader.cancel(); } catch { /* The owned response may already be closed. */ } }
}

function sourceCandidate(source, receipt = null) {
  const analyzed = analyzeHtml(source);
  const candidate = { ...workspace, source, draft: analyzed.draft };
  serializeWorkspace(candidate);
  return { candidate, analyzed, receipt };
}

function applySource({ candidate, analyzed, receipt }) {
  workspace = copy(candidate); report = analyzed; comparison = null; sourceReceipt = receipt; auditFilter = 'all';
  $('page-url').value = workspace.source.url;
  $('html-url').value = workspace.source.url;
  $('html-source').value = workspace.source.html;
  intakeChanged = false;
  renderAll();
  navigate('audit');
  showNotice('Page source analyzed. The studio contains a bounded text extraction for review, not a lossless site copy. Raw HTML and existing AI evidence were kept.');
}

const sourceReplacement = {
  title: 'Analyze a different page?', label: 'Replace page & draft',
  detail: 'This replaces the analyzed source and current content draft. Added AI evidence is kept. Unsaved source inputs will be replaced.',
};

$('url-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = $('page-url').value.trim();
  void importOperation({ label: 'Importing public page source…', replacement: sourceReplacement, commit: applySource,
    load: async signal => {
      const response = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }), signal, credentials: 'omit', redirect: 'error' });
      const data = await readApiResponse(response, signal);
      if (!response.ok) throw { code: typeof data?.error?.code === 'string' ? data.error.code : 'fetch_failed' };
      const page = data?.page;
      if (!page || typeof page.url !== 'string' || typeof page.html !== 'string' || typeof page.headers !== 'object'
        || page.headers === null || !Number.isInteger(page.status) || page.status < 200 || page.status > 299
        || typeof page.fetchedAt !== 'string' || !Number.isFinite(Date.parse(page.fetchedAt))
        || !Number.isInteger(page.redirects) || page.redirects < 0 || page.redirects > 4) throw { code: 'invalid_response' };
      checkedBytes(page.html, MAX_HTML_BYTES, 'response_too_large');
      return sourceCandidate({ url: page.url, html: page.html, headers: page.headers },
        { status: page.status, fetchedAt: page.fetchedAt, redirects: page.redirects });
    } });
});

$('html-form').addEventListener('submit', event => {
  event.preventDefault();
  const source = { url: $('html-url').value.trim(), html: $('html-source').value, headers: {} };
  void importOperation({ label: 'Analyzing supplied HTML…', replacement: sourceReplacement, commit: applySource,
    load: async () => sourceCandidate({ ...source, html: checkedBytes(source.html, MAX_HTML_BYTES, 'invalid_html_file') }) });
});

$('choose-html').addEventListener('click', () => {
  if (!$('html-url').reportValidity()) return;
  $('html-file').click();
});
$('html-file').addEventListener('change', event => {
  const file = event.currentTarget.files?.[0], url = $('html-url').value.trim();
  event.currentTarget.value = '';
  if (!file) return;
  void importOperation({ label: 'Reading supplied HTML file…', replacement: sourceReplacement, commit: applySource,
    load: async () => {
      if (!/\.(html?|txt)$/i.test(file.name)) throw { code: 'invalid_html_file' };
      return sourceCandidate({ url, html: await readFile(file, MAX_HTML_BYTES, 'invalid_html_file'), headers: {} });
    } });
});
for (const id of ['page-url', 'html-url', 'html-source']) $(id).addEventListener('input', () => { intakeChanged = true; touch(); });
$('cancel-import').addEventListener('click', () => cancelRead('Import canceled. Your current workspace was kept.'));

function renderAudit() {
  $('audit-empty').hidden = Boolean(report);
  $('audit-results').hidden = !report;
  $('source-context').hidden = !workspace.source;
  if (workspace.source) {
    replace($('source-context'), el('p', { className: 'eyebrow' }, 'Analyzed source'), el('h3', {}, report?.title || 'Untitled page'),
      el('a', { href: workspace.source.url, target: '_blank', rel: 'noopener noreferrer' }, workspace.source.url),
      el('small', {}, sourceReceipt ? `Public source fetched ${formatDate(sourceReceipt.fetchedAt)} · HTTP ${sourceReceipt.status} · ${sourceReceipt.redirects} redirects`
        : 'Supplied/imported source. Fetch time and HTTP status are not asserted.'));
  }
  if (!report) { replace($('audit-results')); return; }
  const filters = [['all', 'All findings'], ['seo', 'SEO'], ['geo', 'GEO']].map(([value, label]) => {
    const button = action(label, () => {
      auditFilter = value; renderAudit();
      $('audit-results').querySelector(`[data-audit-filter="${value}"]`)?.focus();
    }, 'filter-button');
    button.dataset.auditFilter = value;
    button.setAttribute('aria-pressed', String(auditFilter === value));
    return button;
  });
  const findings = report.checks.filter(check => auditFilter === 'all' || check.area === auditFilter).map(check =>
    el('details', { className: 'finding', ...(check.status === 'fail' ? { open: '' } : {}) },
      el('summary', {}, el('span', { className: `status-pill status-${check.status}` }, check.status),
        el('strong', {}, check.label), el('span', { className: 'finding-area' }, check.area)),
      el('p', {}, check.detail), el('p', { className: 'recommendation' }, check.recommendation)));
  replace($('audit-results'), el('div', { className: 'report-head' }, el('h2', {}, 'Your page, examined.'),
    action('Edit content →', () => navigate('content'))),
  el('div', { className: 'count-strip', 'aria-label': 'Source check counts' }, ['fail', 'review', 'pass'].map(status =>
    el('div', { className: `count-item status-${status}` }, el('strong', {}, report.counts[status]),
      el('span', {}, status === 'fail' ? 'Needs attention' : status === 'review' ? 'Worth reviewing' : 'Checks passed')))),
  el('div', { className: 'finding-filters', role: 'group', 'aria-label': 'Filter source findings' }, filters), findings,
  el('div', { className: 'facts-row' }, el('span', {}, `${report.facts.wordCount} source words`), el('span', {}, `${report.facts.imageCount} images in source`)));
}

function ensureDraft() {
  if (!workspace.draft) workspace.draft = emptyDraft();
  return workspace.draft;
}

function draftInput(id, label, value, maximum, onInput, multiline = false) {
  const input = el(multiline ? 'textarea' : 'input', { id, maxlength: maximum, ...(multiline ? { rows: 3 } : { type: id.includes('source-url') ? 'url' : 'text' }) });
  input.value = value;
  input.addEventListener('input', () => { onInput(input.value); touch({ draft: true }); });
  return [el('label', { for: id }, label), input];
}

function renderRows() {
  const draft = workspace.draft ?? emptyDraft();
  $('questions-empty').hidden = draft.questions.length > 0;
  $('sources-empty').hidden = draft.sources.length > 0;
  $('add-question').disabled = draft.questions.length >= 10;
  $('add-source').disabled = draft.sources.length >= 20;
  replace($('question-rows'), draft.questions.map((row, index) => el('div', { className: 'draft-row' },
    el('div', { className: 'draft-row-top' }, `Question ${index + 1}`, action(`Remove question ${index + 1}`, () => {
      ensureDraft().questions.splice(index, 1); touch({ draft: true }); renderRows(); $('add-question').focus();
    })),
    draftInput(`question-${index}`, `Question ${index + 1}`, row.question, 500, value => { ensureDraft().questions[index].question = value; }),
    draftInput(`answer-${index}`, `Answer ${index + 1}`, row.answer, 5000, value => { ensureDraft().questions[index].answer = value; }, true))));
  replace($('source-rows'), draft.sources.map((row, index) => el('div', { className: 'draft-row' },
    el('div', { className: 'draft-row-top' }, `Source ${index + 1}`, action(`Remove source ${index + 1}`, () => {
      ensureDraft().sources.splice(index, 1); touch({ draft: true }); renderRows(); $('add-source').focus();
    })),
    draftInput(`source-label-${index}`, `Source ${index + 1} label`, row.label, 200, value => { ensureDraft().sources[index].label = value; }),
    draftInput(`source-url-${index}`, `Source ${index + 1} URL`, row.url, 2048, value => { ensureDraft().sources[index].url = value; }))));
}

function renderDraft() {
  const draft = workspace.draft ?? emptyDraft();
  for (const key of ['url', 'title', 'description', 'heading', 'summary', 'body']) $('draft-' + key).value = draft[key];
  renderRows();
}

for (const key of ['url', 'title', 'description', 'heading', 'summary', 'body']) $('draft-' + key).addEventListener('input', event => {
  ensureDraft()[key] = event.currentTarget.value;
  touch({ draft: true });
});
$('draft-form').addEventListener('submit', event => event.preventDefault());
$('add-question').addEventListener('click', () => {
  const draft = ensureDraft(); if (draft.questions.length >= 10) return;
  draft.questions.push({ question: '', answer: '' }); touch({ draft: true }); renderRows(); $('question-' + (draft.questions.length - 1)).focus();
});
$('add-source').addEventListener('click', () => {
  const draft = ensureDraft(); if (draft.sources.length >= 20) return;
  draft.sources.push({ label: '', url: '' }); touch({ draft: true }); renderRows(); $('source-label-' + (draft.sources.length - 1)).focus();
});
$('reset-draft').addEventListener('click', async () => {
  const captured = revision;
  if (hasDraft() && !await confirmReplace('Clear this content draft?', 'The analyzed source and added AI evidence will be kept. The current draft will be cleared.', 'Clear draft')) return;
  if (disposed || captured !== revision) { showNotice('The workspace changed. Your current draft was kept.'); return; }
  workspace.draft = null; touch({ draft: true }); renderDraft(); $('draft-url').focus();
  showNotice('Draft cleared. The analyzed source and added evidence were kept.');
});

function artifacts() {
  if (!$('draft-form').reportValidity()) throw { code: 'draft_incomplete' };
  const draft = normalizeDraft(workspace.draft ?? emptyDraft());
  return { draft, html: createHtml(draft), metadata: createMetadata(draft) };
}

function artifactAction(callback) {
  try { callback(artifacts()); }
  catch { showNotice('Complete a valid page URL, title and main heading, plus every added Q&A/source row, before generating an artifact. Your draft is still here and can be exported as a workspace.', true); }
}

$('download-html').addEventListener('click', () => artifactAction(value => {
  downloadText('forway-page.html', value.html, 'text/html'); showNotice('Page HTML prepared for download. Review it before publishing on your website.');
}));
$('download-metadata').addEventListener('click', () => artifactAction(value => {
  downloadText('forway-head.html', value.metadata, 'text/html'); showNotice('Head metadata prepared for download. Nothing was added to your website.');
}));
$('preview-artifacts').addEventListener('click', () => artifactAction(value => {
  $('html-artifact').textContent = value.html; $('metadata-artifact').textContent = value.metadata;
  $('artifact-review').hidden = false; $('html-artifact').focus();
}));
$('close-artifacts').addEventListener('click', () => { $('artifact-review').hidden = true; $('preview-artifacts').focus(); });
$('review-draft').addEventListener('click', () => artifactAction(value => {
  comparison = { after: analyzeHtml({ html: value.html, url: value.draft.url, headers: workspace.source?.headers ?? {} }), before: report,
    urlChanged: Boolean(workspace.source && workspace.source.url !== value.draft.url) };
  renderComparison();
  $('draft-comparison').scrollIntoView({ block: 'nearest', behavior: 'auto' });
  showNotice(report ? 'Generated HTML re-audited with the original source header context, when supplied. No fresh request or deployment was checked; changed draft URLs still use that old-context assumption.'
    : 'Generated HTML re-audited without observed HTTP headers. These are source-check outcomes, not measured ranking or AI-visibility gains.');
}));

function renderComparison() {
  if (!comparison) {
    replace($('draft-comparison'), el('p', { className: 'eyebrow' }, 'A considered edit'), el('h3', {}, 'Compare your next version.'),
      el('p', {}, 'Re-audit the generated HTML to compare the same source checks. An improved check is not proof of ranking gains.'));
    return;
  }
  const { before, after } = comparison;
  const previous = new Map(before?.checks.map(check => [check.id, check.status]) ?? []);
  replace($('draft-comparison'), el('p', { className: 'eyebrow' }, before ? 'Source → generated draft' : 'Generated draft source checks'),
    el('h3', {}, 'An edit you can inspect.'),
    el('div', { className: 'comparison-counts' }, el('strong', { className: 'status-fail' }, after.counts.fail), 'need attention',
      el('strong', { className: 'status-review' }, after.counts.review), 'to review'),
    el('p', {}, before ? 'Compare imported and generated source using the original observed HTTP headers, when supplied. Content edits do not change those server directives. No fresh fetch or deployment is verified.'
      : 'There is no imported source baseline or observed HTTP response. These findings describe only your generated HTML.'),
    comparison.urlChanged ? el('p', {}, 'The draft URL differs from the source URL. Original headers are an old-context assumption, not evidence of the new URL’s actual response.') : null,
    el('ul', { className: 'comparison-list' }, after.checks.map(check => el('li', {}, check.label,
      el('span', {}, before ? `${previous.get(check.id) ?? 'Not in baseline'} → ${check.status}` : check.status),
      el('span', {}, check.recommendation)))));
}

function rawEvidence() {
  const local = $('evidence-time').value;
  const date = new Date(local);
  if (!local || !Number.isFinite(date.getTime())) throw { code: 'invalid_observation' };
  return normalizeObservation({ brand: $('evidence-brand').value, domain: $('evidence-domain').value,
    competitors: $('evidence-competitors').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    engine: $('evidence-engine').value, prompt: $('evidence-prompt').value, answer: $('evidence-answer').value, observedAt: date.toISOString() });
}

$('evidence-form').addEventListener('input', () => { evidenceChanged = true; touch(); });
$('evidence-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const raw = rawEvidence();
    if (workspace.observations.length >= 500) throw { code: 'observation_limit' };
    analyzeObservation(raw);
    const candidate = { ...workspace, observations: [...workspace.observations, raw] };
    serializeWorkspace(candidate);
    workspace = copy(candidate); cohort = observationCohortKey(raw); touch(); evidenceChanged = false;
    $('evidence-prompt').value = ''; $('evidence-answer').value = ''; $('evidence-time').value = '';
    renderEvidence();
    showNotice('Supplied answer added. Mentions and explicit citations come only from the text you supplied.');
    $('evidence-prompt').focus();
  } catch {
    showNotice('Evidence was not added. Check the brand, plain hostname, competitors, engine, timestamp, prompt and answer. A workspace is limited to 500 answers and 4 MiB. Your form was kept.', true);
  }
});

function rate(value) {
  return value === null ? '—' : new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function renderEvidence() {
  const groups = new Map();
  for (let index = 0; index < workspace.observations.length; index++) {
    const raw = workspace.observations[index], key = observationCohortKey(raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index, report: analyzeObservation(raw) });
  }
  if (!groups.size) {
    replace($('evidence-summary'), el('div', { className: 'evidence-summary-empty' }, el('p', { className: 'eyebrow' }, 'No evidence added yet'),
      el('h2', {}, 'Start with one real answer.'), el('p', {}, 'Add an observed answer and its exact prompt. The summary will state how many supplied answers mention your brand or cite its domain.')));
    replace($('evidence-list')); return;
  }
  if (!groups.has(cohort)) cohort = groups.keys().next().value;
  const selected = groups.get(cohort), reports = selected.map(value => value.report), summary = summarizeObservations(reports);
  const select = el('select', { id: 'evidence-cohort' }, [...groups.entries()].map(([key, values]) => {
    const first = values[0].report;
    const competitors = first.competitors.length ? first.competitors.join(', ') : 'none';
    return el('option', { value: key }, `${first.brand} · ${first.domain} · Competitors: ${competitors} · ${values.length} supplied answer${values.length === 1 ? '' : 's'}`);
  }));
  select.value = cohort;
  select.addEventListener('change', () => { cohort = select.value; renderEvidence(); $('evidence-cohort').focus(); });
  replace($('evidence-summary'), el('label', { for: 'evidence-cohort', className: 'cohort-label' }, 'Brand / domain / competitor cohort'), select,
    el('div', { className: 'evidence-metrics' },
      el('div', { className: 'evidence-metric' }, el('strong', {}, rate(summary.brandMentionRate)), el('span', {}, 'Brand mentions'), el('p', {}, `${summary.brandMentionCount} of ${summary.answerCount} supplied answers`)),
      el('div', { className: 'evidence-metric' }, el('strong', {}, rate(summary.ownedCitationRate)), el('span', {}, 'Owned-domain citations'), el('p', {}, `${summary.ownedCitationCount} of ${summary.answerCount} supplied answers`))),
    el('p', { className: 'evidence-denominator' }, `Denominator: ${summary.answerCount} supplied answer${summary.answerCount === 1 ? '' : 's'} in this cohort. An answer counts once if it has at least one owned-domain citation. These are not representative engine measurements; prompts and engines may differ.`),
    summary.competitors.length ? el('ul', { className: 'competitor-list', 'aria-label': 'Competitor mentions in supplied answers' }, summary.competitors.map(value =>
      el('li', {}, el('span', {}, value.name), el('span', {}, `${value.mentionCount} / ${value.answerCount} · ${rate(value.mentionRate)}`)))) : null,
    el('p', { className: 'eyebrow' }, 'The source evidence'));
  replace($('evidence-list'), selected.map(({ index, report: evidence }) => el('article', { className: 'evidence-record' },
    el('div', { className: 'evidence-record-header' }, el('div', {}, el('strong', {}, evidence.engine), el('small', {}, `Observed ${formatDate(evidence.observedAt)}`)),
      action('Remove', async () => {
        const captured = revision;
        if (!await confirmReplace('Remove this supplied answer?', 'This removes the stored prompt, answer and its contribution to this evidence summary.', 'Remove answer')) return;
        if (disposed || captured !== revision) { showNotice('The workspace changed. No evidence was removed.'); return; }
        workspace.observations.splice(index, 1); touch(); renderEvidence(); $('evidence-summary').querySelector('select')?.focus();
        showNotice('Supplied answer removed from this workspace.');
      })),
    el('p', { className: 'evidence-prompt' }, evidence.prompt),
    el('div', { className: 'record-meta' }, el('span', {}, evidence.mentions.brand ? 'Brand mentioned' : 'Brand not mentioned'),
      el('span', {}, `${evidence.citations.length} explicit cited URL${evidence.citations.length === 1 ? '' : 's'}`)),
    el('details', {}, el('summary', {}, 'Read the supplied answer & citations'), el('blockquote', {}, evidence.answer),
      evidence.citations.length ? el('ul', { className: 'citation-list' }, evidence.citations.map(citation =>
        el('li', {}, el('a', { href: citation.url, target: '_blank', rel: 'noopener noreferrer' }, citation.url), citation.owned ? ' · owned domain' : ''))) : el('p', { className: 'field-help' }, 'No explicit HTTP(S) citation URLs found in this answer.')))));
}

function renderAll() {
  renderAudit(); renderDraft(); renderComparison(); renderEvidence();
  $('artifact-review').hidden = true;
}

$('import-workspace').addEventListener('click', () => $('workspace-file').click());
$('workspace-file').addEventListener('change', event => {
  const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
  if (!file) return;
  void importOperation({ label: 'Opening workspace file…', replacement: { title: 'Replace the entire workspace?', label: 'Import workspace',
    detail: 'This replaces the analyzed source, content draft and all added evidence. Unsubmitted source and evidence inputs are cleared.' },
  load: async () => {
    const value = parseWorkspace(await readFile(file, MAX_WORKSPACE_BYTES, 'invalid_workspace'));
    return { value, analyzed: value.source ? analyzeHtml(value.source) : null };
  }, commit: ({ value, analyzed }) => {
    workspace = copy(value); report = analyzed; sourceReceipt = null; comparison = null; auditFilter = 'all'; cohort = '';
    $('page-url').value = value.source?.url ?? ''; $('html-url').value = value.source?.url ?? ''; $('html-source').value = value.source?.html ?? '';
    $('evidence-form').reset(); intakeChanged = false; evidenceChanged = false;
    renderAll(); navigate(value.source ? 'audit' : value.observations.length ? 'evidence' : 'content');
    showNotice('Workspace imported. Drafts and supplied evidence are in this tab; no site or engine was contacted.');
  } });
});

$('export-workspace').addEventListener('click', async () => {
  const captured = revision;
  if ((intakeChanged || evidenceChanged) && !await confirmReplace('Export the committed workspace?',
    'The export includes your analyzed source, content draft and added evidence. Unsubmitted source/evidence form inputs are not included; submit them first if you want them in the file.', 'Export current workspace')) return;
  if (disposed || captured !== revision) { showNotice('The workspace changed. Please export again to capture your current work.'); return; }
  try {
    const value = serializeWorkspace(workspace);
    downloadText('forway-workspace.json', value, 'application/json');
    exportedRevision = revision; updateMemoryLabel();
    showNotice('Workspace JSON prepared for download. Keep the file to resume your work; Forway does not save automatically.');
  } catch {
    showNotice('Workspace export could not be prepared. Check for invalid partial URLs or an oversized workspace. Your current source, edits and evidence remain in this tab.', true);
  }
});

$('new-workspace').addEventListener('click', async () => {
  const captured = revision;
  if (hasWork() && !await confirmReplace('Start a new workspace?', 'This clears the source, draft, all supplied evidence and unsubmitted forms in this tab.', 'Start new workspace')) return;
  if (disposed || captured !== revision) { showNotice('The workspace changed. Your work was kept.'); return; }
  cancelRead(); workspace = { version: 1, source: null, draft: null, observations: [] };
  report = null; comparison = null; sourceReceipt = null; cohort = ''; auditFilter = 'all';
  $('url-form').reset(); $('html-form').reset(); $('evidence-form').reset(); intakeChanged = false; evidenceChanged = false;
  revision++; exportedRevision = revision; renderAll(); updateMemoryLabel(); navigate('audit'); $('page-url').focus();
  showNotice('New workspace ready. No page, content or evidence has been added.');
});

for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => navigate(button.dataset.view));
$('dismiss-notice').addEventListener('click', () => { $('app-notice').hidden = true; });
$('open-about').addEventListener('click', event => { event.preventDefault(); $('about-dialog').showModal(); });
window.addEventListener('hashchange', () => { const view = location.hash.slice(1); if (Object.hasOwn(titles, view)) navigate(view); });
window.addEventListener('beforeunload', event => {
  if (revision !== exportedRevision && hasWork()) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', event => {
  cancelRead();
  if (!event.persisted) { disposed = true; confirmation?.(false); confirmation = null; }
});

renderAll();
navigate(Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'audit', false);
