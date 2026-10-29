const RAW_FIELDS = ['brand', 'domain', 'competitors', 'engine', 'prompt', 'answer', 'observedAt'];
const invalid = () => { throw new TypeError('Invalid supplied answer observation.'); };
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) invalid();
  for (const key of actual) { const field = Object.getOwnPropertyDescriptor(value, key); if (!Object.hasOwn(field, 'value') || !field.enumerable) invalid(); }
  return value;
}
function text(value, maximum, nonblank = true) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0') || (nonblank && !value.trim())) invalid();
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) invalid(); }
    else if (code >= 0xdc00 && code <= 0xdfff) invalid();
  }
  return value;
}
function list(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) { const entry = Object.getOwnPropertyDescriptor(value, String(index)); if (!entry || !Object.hasOwn(entry, 'value') || !entry.enumerable) invalid(); }
  return value;
}
const folded = value => value.normalize('NFC').toLowerCase();
function hostname(value) {
  text(value, 253);
  if (/[\s/:?#@\\]/u.test(value) || value.endsWith('.') || value.startsWith('.')) invalid();
  let url;
  try { url = new URL(`https://${value}`); } catch { invalid(); }
  const host = url.hostname;
  if (!host || host.length > 253 || !host.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) invalid();
  return host;
}
function timestamp(value) {
  text(value, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) invalid();
  const date = new Date(value), canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, part) => `.${(part ?? '').padEnd(3, '0')}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) invalid();
  return value;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function normalizeObservation(value) {
  const input = record(value, RAW_FIELDS);
  const brand = text(input.brand, 100), competitors = list(input.competitors, 20).map(value => text(value, 100));
  if ([brand, ...competitors].some(value => value !== value.trim()) || new Set([brand, ...competitors].map(folded)).size !== competitors.length + 1) invalid();
  return freeze({ brand, domain: hostname(input.domain), competitors, engine: text(input.engine, 100),
    prompt: text(input.prompt, 10000), answer: text(input.answer, 100000), observedAt: timestamp(input.observedAt) });
}
export function observationCohortKey(value) {
  const raw = normalizeObservation(value);
  return JSON.stringify([folded(raw.brand), raw.domain, raw.competitors.map(folded).sort()]);
}
const word = value => value !== undefined && /[\p{L}\p{N}\p{M}_]/u.test(value);
function mentions(answer, name) {
  const haystack = folded(answer), needle = folded(name);
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    const before = Array.from(haystack.slice(Math.max(0, index - 2), index)).at(-1);
    const after = String.fromCodePoint(haystack.codePointAt(index + needle.length) ?? 0);
    if (!word(before) && !word(after)) return true;
    index += needle.length;
  }
  return false;
}
function citedUrls(answer, domain) {
  const found = new Map();
  for (const match of answer.matchAll(/https?:\/\/[^\s<>"'`]+/giu)) {
    let candidate = match[0].replace(/[.,;!?]+$/u, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) candidate = candidate.slice(0, -1);
    }
    if (candidate.length > 2048) continue;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      found.set(url.href, { url: url.href, owned: url.hostname === domain || url.hostname.endsWith(`.${domain}`) });
    } catch { /* A supplied token that is not a URL is not a citation. */ }
  }
  return [...found.values()];
}
export function analyzeObservation(value) {
  const raw = normalizeObservation(value);
  return freeze({ ...raw, mentions: { brand: mentions(raw.answer, raw.brand), competitors: raw.competitors.map(name => ({ name, mentioned: mentions(raw.answer, name) })) },
    citations: citedUrls(raw.answer, raw.domain) });
}
function checkedReport(value) {
  const input = record(value, [...RAW_FIELDS, 'mentions', 'citations']);
  const expected = analyzeObservation(Object.fromEntries(RAW_FIELDS.map(key => [key, input[key]])));
  const annotation = record(input.mentions, ['brand', 'competitors']);
  if (annotation.brand !== expected.mentions.brand) invalid();
  const competitors = list(annotation.competitors, 20).map(value => {
    const row = record(value, ['name', 'mentioned']); if (typeof row.mentioned !== 'boolean') invalid(); return { name: text(row.name, 100), mentioned: row.mentioned };
  });
  const citations = list(input.citations, 10000).map(value => {
    const row = record(value, ['url', 'owned']); if (typeof row.owned !== 'boolean') invalid(); return { url: text(row.url, 2048), owned: row.owned };
  });
  if (JSON.stringify(competitors) !== JSON.stringify(expected.mentions.competitors) || JSON.stringify(citations) !== JSON.stringify(expected.citations)) invalid();
  return expected;
}
export function summarizeObservations(value) {
  const reports = list(value, 500).map(checkedReport);
  const first = reports[0], key = first ? observationCohortKey(Object.fromEntries(RAW_FIELDS.map(key => [key, first[key]]))) : null;
  for (const report of reports) {
    if (observationCohortKey(Object.fromEntries(RAW_FIELDS.map(key => [key, report[key]]))) !== key) throw new TypeError('Observation summaries require one brand, domain and competitor cohort.');
  }
  const answerCount = reports.length, brandMentionCount = reports.filter(report => report.mentions.brand).length;
  const ownedCitationCount = reports.filter(report => report.citations.some(citation => citation.owned)).length;
  const rate = count => answerCount ? count / answerCount : null;
  return freeze({ answerCount, brandMentionCount, ownedCitationCount, brandMentionRate: rate(brandMentionCount), ownedCitationRate: rate(ownedCitationCount),
    competitors: (first?.competitors ?? []).map(name => {
      const mentionCount = reports.filter(report => report.mentions.competitors.some(row => folded(row.name) === folded(name) && row.mentioned)).length;
      return { name, answerCount, mentionCount, mentionRate: rate(mentionCount) };
    }) });
}
