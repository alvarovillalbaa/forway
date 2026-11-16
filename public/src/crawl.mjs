import { parseRobots } from './robots.mjs';
import { parseSitemap } from './sitemap.mjs';

export const CRAWL_LIMITS = Object.freeze({ requests: 25, bytes: 8 * 1024 * 1024, milliseconds: 60_000,
  documentBytes: 1024 * 1024, pages: 1000, frontier: 1000, storedBytes: 12 * 1024 * 1024, exportBytes: 16 * 1024 * 1024 });
const size = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const failure = code => { const error = new Error(code); error.code = code; return error; };
export function crawlURL(value, base) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(value)) throw failure('invalid_url');
  const url = new URL(value, base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || url.href.length > 2048) throw failure('invalid_url');
  url.hash = ''; return url.href;
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(failure('cancelled')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); signal.aborted ? abort() : resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

/** Serial discovery. The injected seams are source-only, never public request fields. */
export function createSiteCrawler(seed, { getDocument, inspectPage, progress = () => {}, now = Date.now, limits = {} }) {
  const bound = { ...CRAWL_LIMITS, ...limits };
  for (const key of Object.keys(bound)) if (!Object.hasOwn(CRAWL_LIMITS, key) || !Number.isSafeInteger(bound[key]) || bound[key] < 1 || bound[key] > CRAWL_LIMITS[key]) throw failure('invalid_limits');
  if (typeof getDocument !== 'function' || typeof inspectPage !== 'function') throw failure('invalid_crawler');
  const normalized = crawlURL(seed), hostname = new URL(normalized).hostname;
  let data = { format: 'forway-crawl-v1', seed: normalized, state: 'paused', reason: 'not_started',
    rows: [{ url: normalized, status: 'pending', reason: '' }], frontier: [{ kind: 'page', url: normalized }],
    pages: [], expansions: [], documents: [], batch: null, outsideScope: 0 };
  let active = null, disposed = false, stored = size(data);
  let rows = new Map(data.rows.map(row => [row.url, row]));
  let queued = new Set(data.frontier.map(row => row.kind + ':' + row.url));
  const derived = new Map();
  function summary() {
    const counts = Object.fromEntries(['pending', 'done', 'refused', 'failed', 'redirected'].map(status => [status, data.rows.filter(r => r.status === status).length]));
    return { hostname, state: data.state, reason: data.reason, discovered: data.rows.length, ...counts,
      pendingDocuments: data.frontier.filter(r => r.kind === 'sitemap').length, pendingExpansions: data.expansions.length,
      outsideScope: data.outsideScope, batch: data.batch ? { ...data.batch } : null, limits: { ...bound } };
  }
  function emit() { progress(summary()); }
  function reserve(value) { const bytes = size(value) + 64; if (stored + bytes > bound.storedBytes) throw failure('storage_limit'); stored += bytes; }
  function log(value) { reserve(value); data.documents.push(value); }
  function enqueue(kind, raw, base, scope) {
    let url; try { url = crawlURL(raw, base); } catch { data.outsideScope++; return true; }
    if (new URL(url).hostname !== hostname || scope && !url.startsWith(scope)) { data.outsideScope++; return true; }
    const key = kind + ':' + url; if (queued.has(key)) return true;
    if (data.frontier.length >= bound.frontier) return false;
    const row = { kind, url }; reserve(row);
    if (kind === 'page') { const page = { url, status: 'pending', reason: '' }; reserve(page); rows.set(url, page); data.rows.push(page); }
    queued.add(key); data.frontier.push(row); return true;
  }
  function expand() {
    if (!data.expansions.length) return true;
    const expansion = data.expansions[0];
    const candidates = expansion.kind === 'seeds' ? expansion.urls : expansion.kind === 'page'
      ? inspectPage(data.pages.find(page => page.url === expansion.url)).links
      : parseSitemap(expansion.text).urls;
    if (!Array.isArray(candidates) || candidates.some(url => typeof url !== 'string')) throw failure('invalid_source');
    const kind = expansion.kind === 'seeds' ? 'sitemap' : expansion.kind === 'page' || parseSitemap(expansion.text).kind === 'pages' ? 'page' : 'sitemap';
    const scope = expansion.kind === 'sitemap' && kind === 'page' ? new URL('./', expansion.url).href : undefined;
    while (expansion.index < candidates.length) {
      if (expansion.kind === 'seeds' && !/^[a-z]+:\/\//i.test(candidates[expansion.index])) { data.outsideScope++; expansion.index++; continue; }
      if (!enqueue(kind, candidates[expansion.index], expansion.url, scope)) return false;
      expansion.index++;
    }
    data.expansions.shift(); if (expansion.kind !== 'page') stored -= size(expansion) + 64; return true;
  }
  async function run() {
    if (active || disposed) return;
    const controller = new AbortController(); active = controller;
    const policies = new Map(), started = now();
    data.batch = { chargedRequests: 0, responseBytes: 0, chargedBytes: 0, startedAt: new Date(started).toISOString() };
    data.state = 'running'; data.reason = ''; emit();
    const timer = setTimeout(() => controller.abort('time_limit'), bound.milliseconds);
    const guard = () => { if (controller.signal.aborted || active !== controller || disposed) throw failure('cancelled'); if (now() - started >= bound.milliseconds) throw failure('time_limit'); };
    async function fetchDocument(kind, url) {
      guard(); const charge = kind === 'robots' ? 6 : 1;
      if (data.batch.chargedRequests + charge > bound.requests) throw failure('request_limit');
      if (data.batch.chargedBytes + bound.documentBytes > bound.bytes) throw failure('byte_limit');
      let document;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(9500)]);
        document = await abortable(Promise.resolve().then(() => { guard(); return getDocument({ kind, url }, signal); }), signal);
        guard();
        if (!object(document) || document.kind !== kind || !Number.isInteger(document.status) || document.status < 200 || document.status > 599
          || !Number.isInteger(document.requests) || document.requests < 1 || document.requests > charge
          || !Number.isSafeInteger(document.bytes) || document.bytes < 0 || document.bytes > bound.documentBytes
          || typeof document.text !== 'string' || size(document.text) !== document.bytes
          || crawlURL(document.url) !== document.url || new URL(document.url).hostname !== hostname
          || kind !== 'robots' && document.url !== url
          || typeof document.fetchedAt !== 'string' || !Number.isFinite(Date.parse(document.fetchedAt))) throw failure('invalid_document');
      } catch (error) {
        data.batch.chargedRequests += charge; data.batch.chargedBytes += bound.documentBytes; throw error;
      }
      data.batch.chargedRequests += document.requests; data.batch.responseBytes += document.bytes; data.batch.chargedBytes += document.bytes;
      log({ kind, requestedURL: url, finalURL: document.url, status: document.status, bytes: document.bytes, requests: document.requests, fetchedAt: document.fetchedAt });
      return document;
    }
    async function robots(url) {
      const origin = new URL(url).origin;
      if (policies.has(origin)) return policies.get(origin);
      let document;
      try { document = await fetchDocument('robots', origin + '/robots.txt'); }
      catch (error) { if (['request_limit', 'byte_limit', 'time_limit', 'cancelled', 'storage_limit'].includes(error.code)) throw error; throw failure('robots_unreachable'); }
      let policy;
      if ([404, 410].includes(document.status) || document.status === 204) policy = parseRobots('');
      else if (document.status >= 200 && document.status < 300) { try { policy = parseRobots(document.text); } catch { throw failure('robots_unreadable'); } }
      else throw failure('robots_unreachable');
      policies.set(origin, policy);
      // Every declared sitemap is retained as a resumable expansion; no URL sample.
      const seeds = { url: origin + '/robots.txt', kind: 'seeds', index: 0,
        urls: policy.sitemaps.length ? [...policy.sitemaps] : [origin + '/sitemap.xml'] };
      reserve(seeds); data.expansions.push(seeds);
      return policy;
    }
    try {
      while (data.frontier.length || data.expansions.length) {
        guard();
        if (data.expansions.length) {
          const expanded = expand();
          if (expanded && data.expansions.length) continue;
          if (!expanded && !data.frontier.length) throw failure('frontier_limit');
        }
        const item = data.frontier[0]; if (!item) continue;
        if (item.kind === 'page' && data.pages.length >= bound.pages) throw failure('page_limit');
        const policy = await robots(item.url); guard();
        if (!policy.allows(item.url)) {
          log({ kind: item.kind, requestedURL: item.url, status: 'refused', reason: 'robots_disallow' });
          if (item.kind === 'page') Object.assign(rows.get(item.url), { status: 'refused', reason: 'robots_disallow' });
          data.frontier.shift(); emit(); continue;
        }
        let document;
        try { document = await fetchDocument(item.kind, item.url); }
        catch (error) {
          if (['request_limit', 'byte_limit', 'time_limit', 'cancelled', 'storage_limit'].includes(error.code)) throw error;
          log({ kind: item.kind, requestedURL: item.url, status: 'failed', reason: 'document_unavailable' });
          if (item.kind === 'page') Object.assign(rows.get(item.url), { status: 'failed', reason: 'document_unavailable' });
          data.frontier.shift(); emit(); continue;
        }
        guard();
        if (document.redirectTo) {
          let target; try { target = crawlURL(document.redirectTo, item.url); } catch { target = null; }
          if (!target || new URL(target).hostname !== hostname) {
            log({ kind: item.kind, requestedURL: item.url, status: 'refused', reason: 'outside_site' });
            if (item.kind === 'page') Object.assign(rows.get(item.url), { status: 'refused', reason: 'outside_site' });
            data.frontier.shift(); emit(); continue;
          }
          let next = target; const followed = new Set([item.url]); let cycle = false;
          while (next) { if (followed.has(next)) { cycle = true; break; } followed.add(next); next = rows.get(next)?.redirectTo; }
          if (!cycle && !enqueue(item.kind, target, item.url)) throw failure('frontier_limit');
          if (item.kind === 'page') Object.assign(rows.get(item.url), cycle ? { status: 'failed', reason: 'redirect_loop' }
            : { status: 'redirected', reason: 'redirect_observed', redirectTo: target });
          data.frontier.shift(); emit(); continue;
        }
        if (document.status < 200 || document.status >= 300) throw failure('invalid_document');
        try {
          if (item.kind === 'page') {
            const page = { url: item.url, html: document.text, headers: document.headers ?? {}, fetchedAt: document.fetchedAt, sourceKind: 'fetched' };
            const facts = inspectPage(page); if (!object(facts) || !Array.isArray(facts.links)) throw failure('invalid_source');
            reserve(page); data.pages.push(page); derived.set(item.url, { url: item.url, facts: facts.facts, agentFacts: facts.agentFacts, sourceKind: 'fetched', fetchedAt: page.fetchedAt });
            Object.assign(rows.get(item.url), { status: 'done', reason: '' });
            data.expansions.push({ url: item.url, kind: 'page', index: 0 });
          } else { parseSitemap(document.text); const expansion = { url: item.url, kind: 'sitemap', index: 0, text: document.text }; reserve(expansion); data.expansions.push(expansion); }
        } catch (error) {
          if (error.code === 'storage_limit') throw error;
          log({ kind: item.kind, requestedURL: item.url, status: 'failed', reason: 'invalid_source' });
          if (item.kind === 'page') Object.assign(rows.get(item.url), { status: 'failed', reason: 'invalid_source' });
        }
        data.frontier.shift(); emit();
      }
      data.state = 'frontier_exhausted'; data.reason = 'Discoverable frontier drained; this does not establish every page on the domain.';
    } catch (error) {
      data.reason = controller.signal.reason === 'time_limit' ? 'time_limit' : error.code ?? 'crawl_unavailable';
      data.state = controller.signal.aborted && controller.signal.reason !== 'time_limit' ? 'cancelled' : 'paused';
    } finally {
      clearTimeout(timer); if (active === controller) active = null;
      data.batch.finishedAt = new Date(now()).toISOString(); emit();
    }
  }
  function serialize() {
    const value = JSON.stringify(data, null, 2) + '\n';
    if (size(value) > bound.exportBytes) throw failure('export_limit'); return value;
  }
  function restore(text) {
    if (active || disposed || typeof text !== 'string' || size(text) > bound.exportBytes) throw failure('invalid_crawl');
    const value = JSON.parse(text);
    const allowed = ['format', 'seed', 'state', 'reason', 'rows', 'frontier', 'pages', 'expansions', 'documents', 'batch', 'outsideScope'];
    if (!object(value) || Object.keys(value).length !== allowed.length || Object.keys(value).some(key => !allowed.includes(key)) || value.format !== 'forway-crawl-v1'
      || crawlURL(value.seed) !== normalized || !Number.isSafeInteger(value.outsideScope) || value.outsideScope < 0
      || !['rows', 'frontier', 'pages', 'expansions', 'documents'].every(key => Array.isArray(value[key]) && value[key].length <= 50_000)
      || value.pages.length > bound.pages || value.frontier.length > bound.frontier || size(value) > bound.storedBytes) throw failure('invalid_crawl');
    const nextRows = new Map();
    const fields = (record, required, optional = []) => {
      if (!object(record) || Object.keys(record).some(key => !required.includes(key) && !optional.includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw failure('invalid_crawl');
    };
    const checkURL = url => { if (crawlURL(url) !== url || new URL(url).hostname !== hostname) throw failure('invalid_crawl'); };
    for (const row of value.rows) { fields(row, ['url', 'status', 'reason'], ['redirectTo']); checkURL(row.url); if (row.redirectTo !== undefined) checkURL(row.redirectTo); if (nextRows.has(row.url) || !['pending', 'done', 'refused', 'failed', 'redirected'].includes(row.status) || typeof row.reason !== 'string' || row.reason.length > 100) throw failure('invalid_crawl'); nextRows.set(row.url, row); }
    const pageNames = new Set(), nextDerived = new Map();
    for (const page of value.pages) {
      fields(page, ['url', 'html', 'headers', 'fetchedAt', 'sourceKind']);
      checkURL(page.url); if (typeof page.html !== 'string' || size(page.html) > bound.documentBytes || !object(page.headers) || pageNames.has(page.url) || nextRows.get(page.url)?.status !== 'done') throw failure('invalid_crawl');
      fields(page.headers, [], ['content-type', 'x-robots-tag']);
      for (const header of Object.values(page.headers)) if (header !== null && (typeof header !== 'string' || header.length > 4096 || /[\r\n\0]/.test(header))) throw failure('invalid_crawl');
      pageNames.add(page.url); const facts = inspectPage(page);
      // An imported receipt is supplied source, not a new network observation.
      page.sourceKind = 'supplied'; page.fetchedAt = null;
      nextDerived.set(page.url, { url: page.url, facts: facts.facts, agentFacts: facts.agentFacts, sourceKind: 'supplied', fetchedAt: null });
    }
    const nextQueued = new Set(value.rows.map(row => 'page:' + row.url));
    const frontierKeys = new Set();
    for (const item of value.frontier) { fields(item, ['kind', 'url']); checkURL(item.url); const key = item.kind + ':' + item.url;
      if (!['page', 'sitemap'].includes(item.kind) || frontierKeys.has(key) || item.kind === 'page' && nextRows.get(item.url)?.status !== 'pending') throw failure('invalid_crawl'); frontierKeys.add(key); nextQueued.add(key); }
    if ([...nextRows.values()].some(row => row.status === 'pending' && !frontierKeys.has('page:' + row.url))) throw failure('invalid_crawl');
    for (const item of value.expansions) { fields(item, ['url', 'kind', 'index'], item.kind === 'sitemap' ? ['text'] : item.kind === 'seeds' ? ['urls'] : []); checkURL(item.url); if (!Number.isSafeInteger(item.index) || item.index < 0 || !['page', 'sitemap', 'seeds'].includes(item.kind)
      || item.kind === 'page' && !pageNames.has(item.url) || item.kind === 'sitemap' && typeof item.text !== 'string') throw failure('invalid_crawl'); if (item.kind === 'sitemap') parseSitemap(item.text); }
    for (const item of value.expansions) if (item.kind === 'seeds' && (!Array.isArray(item.urls) || item.urls.some(url => typeof url !== 'string' || url.length > 2048))) throw failure('invalid_crawl');
    for (const item of value.expansions) {
      const length = item.kind === 'seeds' ? item.urls.length : item.kind === 'sitemap' ? parseSitemap(item.text).urls.length : inspectPage(value.pages.find(page => page.url === item.url)).links.length;
      if (item.index > length) throw failure('invalid_crawl');
    }
    for (const item of value.documents) {
      fields(item, ['kind', 'requestedURL', 'status'], ['finalURL', 'reason', 'bytes', 'requests', 'fetchedAt']);
      checkURL(item.requestedURL); if (item.finalURL !== undefined) checkURL(item.finalURL);
      if (!['page', 'sitemap', 'robots'].includes(item.kind) || !([ 'failed', 'refused'].includes(item.status) || Number.isInteger(item.status) && item.status >= 200 && item.status <= 599)
        || item.reason !== undefined && (typeof item.reason !== 'string' || item.reason.length > 100)) throw failure('invalid_crawl');
      if (item.kind === 'sitemap') nextQueued.add('sitemap:' + item.requestedURL);
    }
    if ([...nextRows.values()].filter(r => r.status === 'done').length !== pageNames.size) throw failure('invalid_crawl');
    // Copy only this format's declared state. Policies are deliberately refetched.
    data = structuredClone(Object.fromEntries(allowed.map(key => [key, value[key]])));
    data.state = 'paused'; data.reason = 'imported_resume'; data.batch = null;
    rows = new Map(data.rows.map(row => [row.url, row])); queued = nextQueued; derived.clear(); for (const [key, facts] of nextDerived) derived.set(key, facts);
    stored = size(data); emit();
  }
  return { run, summary, serialize, restore,
    sources: () => structuredClone([...derived.values()]),
    snapshot: () => structuredClone(data),
    cancel() { active?.abort('cancelled'); },
    dispose() { disposed = true; active?.abort('cancelled'); },
  };
}
