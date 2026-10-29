import { normalizeDraft } from './content.mjs';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const NUMBERS = ['titleCount', 'descriptionCount', 'canonicalCount', 'h1Count', 'headingCount', 'wordCount', 'imageCount', 'missingAltCount',
  'linkCount', 'unlabeledLinkCount', 'externalLinkCount', 'jsonLdCount', 'invalidJsonLdCount', 'questionHeadingCount', 'answeredQuestionCount'];
const FACT_FIELDS = ['title', 'description', 'canonical', 'robotsDirectives', ...NUMBERS];
const invalid = () => { throw new TypeError('Invalid page audit evidence.'); };
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const actual = Reflect.ownKeys(value);
  if (keys && (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key)))) invalid();
  for (const key of actual) {
    if (typeof key !== 'string') invalid();
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(field, 'value') || !field.enumerable) invalid();
  }
  return value;
}
function text(value, maximum = MAX_HTML_BYTES) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) invalid();
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
function safeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2048 ? url.href : null; }
  catch { return null; }
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function factsFrom(value) {
  const input = record(value, FACT_FIELDS), facts = { title: text(input.title), description: text(input.description),
    canonical: input.canonical === null ? null : safeUrl(input.canonical), robotsDirectives: list(input.robotsDirectives, 128).map(value => text(value, 4096)) };
  if (input.canonical !== null && facts.canonical === null) invalid();
  for (const key of NUMBERS) { if (!Number.isSafeInteger(input[key]) || input[key] < 0) invalid(); facts[key] = input[key]; }
  if (facts.h1Count > facts.headingCount || facts.questionHeadingCount > facts.headingCount || facts.answeredQuestionCount > facts.questionHeadingCount
    || facts.missingAltCount > facts.imageCount || facts.unlabeledLinkCount > facts.linkCount || facts.externalLinkCount > facts.linkCount
    || facts.invalidJsonLdCount > facts.jsonLdCount || (!facts.titleCount && facts.title) || (!facts.descriptionCount && facts.description)
    || (!facts.canonicalCount && facts.canonical !== null)) invalid();
  return facts;
}

/** Interpret supplied source facts only; no DOM, network, ranking or AI visibility measurement. */
export function auditFacts(value) {
  const facts = factsFrom(value), checks = [];
  const add = (id, area, label, status, detail, recommendation) => checks.push({ id, area, label, status, detail, recommendation });
  add('seo-title', 'seo', 'Page title', !facts.title.trim() ? 'fail' : facts.titleCount === 1 ? 'pass' : 'review',
    `${facts.titleCount} title element(s); ${facts.title.length} characters in the first.`, 'Keep one descriptive title that accurately represents this page.');
  add('seo-description', 'seo', 'Description metadata', facts.description.trim() && facts.descriptionCount === 1 ? 'pass' : 'review',
    `${facts.descriptionCount} description tag(s); ${facts.description.length} characters in the first.`, 'Review a clear page-specific description; this is not a ranking or snippet guarantee.');
  add('seo-canonical', 'seo', 'Canonical hint', facts.canonical && facts.canonicalCount === 1 ? 'pass' : 'review',
    `${facts.canonicalCount} canonical link(s); ${facts.canonical ? 'first target is an HTTP(S) URL' : 'no usable first target'}.`, 'Review one intended canonical address. Search engines can choose a different canonical.');
  add('seo-h1', 'seo', 'Primary source heading', facts.h1Count === 1 ? 'pass' : 'review', `${facts.h1Count} H1 heading(s) in source.`,
    'Review the heading hierarchy and make the main subject clear; this check does not establish rendered accessibility.');
  const blocked = facts.robotsDirectives.some(value => /(?:^|[\s,;:])(?:noindex|none)(?:$|[\s,;])/iu.test(value));
  add('seo-robots', 'seo', 'Observed indexing directives', blocked ? 'review' : 'pass',
    blocked ? 'A noindex/none directive was supplied in source or response headers.' : 'No noindex/none directive was observed in supplied source and headers.',
    'Confirm indexing intent. robots.txt, crawler access and actual indexing were not checked.');
  add('seo-links', 'seo', 'Source link labels', facts.linkCount && !facts.unlabeledLinkCount ? 'pass' : 'review',
    `${facts.linkCount} link(s), ${facts.unlabeledLinkCount} without an observed text/ARIA/title/image-alt label.`, 'Review link names and destinations. No destination or broken-link request was made.');
  add('seo-images', 'seo', 'Image alt attributes', facts.missingAltCount ? 'review' : 'pass',
    `${facts.imageCount} image(s), ${facts.missingAltCount} without an alt attribute. Empty alt may intentionally mark decoration.`, 'Describe meaningful images; inspect decorative intent and rendered behavior separately.');
  add('seo-jsonld', 'seo', 'JSON-LD source syntax', facts.jsonLdCount && !facts.invalidJsonLdCount ? 'pass' : 'review',
    `${facts.jsonLdCount} JSON-LD script(s), ${facts.invalidJsonLdCount} with invalid JSON syntax.`, 'Use truthful structured data matching visible content. Syntax alone does not establish schema correctness, rich-result eligibility or facts.');
  add('geo-content', 'geo', 'Extractable source text', facts.wordCount ? 'pass' : 'review',
    `${facts.wordCount} approximate Unicode word token(s), excluding scripts, styles, templates and explicitly hidden content.`, 'Provide useful, accurate source text. This is neither rendered-page measurement nor a content-quality score.');
  add('geo-headings', 'geo', 'Source structure', facts.headingCount ? 'pass' : 'review', `${facts.headingCount} source heading(s).`,
    'Organize the subject into meaningful sections. Heading presence cannot establish answer-engine visibility.');
  add('geo-answers', 'geo', 'Question and answer structure', facts.questionHeadingCount && facts.answeredQuestionCount === facts.questionHeadingCount ? 'pass' : 'review',
    `${facts.questionHeadingCount} question-mark heading(s), ${facts.answeredQuestionCount} followed immediately by a nonempty paragraph.`,
    'Where useful, answer real questions directly. This narrow source heuristic does not require every page to be an FAQ or verify any answer.');
  add('geo-sources', 'geo', 'Potential source links', facts.externalLinkCount ? 'pass' : 'review', `${facts.externalLinkCount} HTTP(S) link(s) to a different hostname.`,
    'Review relevant primary references and label them clearly. An external link is not proof of authority, factual support or an AI citation.');
  const counts = { pass: 0, review: 0, fail: 0 }; checks.forEach(check => { counts[check.status] += 1; });
  return freeze({ checks, counts });
}

const clean = value => (value ?? '').replace(/\s+/gu, ' ').trim();
function clip(value, maximum) { const clipped = value.slice(0, maximum); return /[\ud800-\udbff]$/u.test(clipped) ? clipped.slice(0, -1) : clipped; }
function question(element) { return /[?？]\s*$/u.test(clean(element.textContent)); }
function sourceText(root, omitted = new Set()) {
  const blocks = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TABLE', 'TR', 'TD', 'TH']);
  const parts = [], stack = [{ node: root, closing: false }];
  while (stack.length) {
    const { node, closing } = stack.pop();
    if (omitted.has(node)) continue;
    if (node.nodeType === 3) { parts.push(node.textContent); continue; }
    const block = blocks.has(node.tagName);
    if (closing) { if (block) parts.push(' '); continue; }
    if (block) parts.push(' ');
    stack.push({ node, closing: true });
    for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push({ node: node.childNodes[index], closing: false });
  }
  return clean(parts.join(''));
}

/** Parse only inside an inert template; imported nodes are never mounted or executed. */
export function analyzeHtml({ html, url, headers = {} }) {
  text(html);
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) throw new TypeError('Page source exceeds the audit limit.');
  const sourceUrl = safeUrl(url);
  if (!sourceUrl) invalid();
  const suppliedHeaders = record(headers), robotsDirectives = [];
  if (Reflect.ownKeys(suppliedHeaders).length > 128) invalid();
  for (const [name, value] of Object.entries(suppliedHeaders)) {
    text(name, 200);
    if (name.toLowerCase() === 'x-robots-tag' && value === null) continue;
    text(value, 4096);
    if (name.toLowerCase() === 'x-robots-tag') robotsDirectives.push(value);
  }
  if (!globalThis.document?.createElement) throw new TypeError('HTML analysis requires the browser inert-template parser.');
  const template = document.createElement('template'); template.innerHTML = html;
  const root = template.content;
  const titles = [...root.querySelectorAll('title')];
  const descriptions = [...root.querySelectorAll('meta[name]')].filter(element => element.getAttribute('name').toLowerCase() === 'description');
  for (const element of root.querySelectorAll('meta[name]')) {
    if (['robots', 'googlebot', 'bingbot'].includes(element.getAttribute('name').toLowerCase())) robotsDirectives.push(element.getAttribute('content') ?? '');
  }
  if (robotsDirectives.length > 128) invalid();
  const title = clean(titles[0]?.textContent), description = clean(descriptions[0]?.getAttribute('content'));
  const base = safeUrl(root.querySelector('base[href]')?.getAttribute('href'), sourceUrl) || sourceUrl;
  const canonicals = [...root.querySelectorAll('link[rel]')].filter(element => element.getAttribute('rel').toLowerCase().split(/\s+/u).includes('canonical'));
  const canonical = canonicals.length ? safeUrl(canonicals[0].getAttribute('href'), base) : null;
  const scripts = [...root.querySelectorAll('script[type]')].filter(element => element.getAttribute('type').trim().toLowerCase() === 'application/ld+json');
  let invalidJsonLdCount = 0;
  for (const script of scripts) { try { JSON.parse(script.textContent); } catch { invalidJsonLdCount += 1; } }
  for (const element of root.querySelectorAll('script,style,template,noscript,title,[hidden],[aria-hidden="true"]')) element.remove();
  const headingElements = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const headings = headingElements.map(element => ({ level: Number(element.tagName.slice(1)), text: clean(element.textContent) }));
  const images = [...root.querySelectorAll('img')], links = [...root.querySelectorAll('a[href]')];
  const external = links.map(element => ({ element, url: safeUrl(element.getAttribute('href'), base) })).filter(value => value.url && new URL(value.url).hostname !== new URL(sourceUrl).hostname);
  const projectedAnswers = new Set();
  const questions = headingElements.filter(question).map(element => {
    const paragraph = element.nextElementSibling?.tagName === 'P' ? element.nextElementSibling : null;
    const answer = clean(paragraph?.textContent);
    if (answer && projectedAnswers.size < 10) projectedAnswers.add(paragraph);
    return { question: clean(element.textContent), answer };
  }).filter(value => value.question && value.answer);
  const labelledElements = new Map([...root.querySelectorAll('[id]')].map(element => [element.id, element])), labelText = new Map();
  const unlabeledLinkCount = links.filter(element => {
    const referenced = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/u).filter(Boolean)
      .map(id => { if (!labelText.has(id)) labelText.set(id, labelledElements.get(id)?.textContent ?? ''); return labelText.get(id); }).join(' ');
    return !clean(element.textContent) && !clean(element.getAttribute('aria-label')) && !clean(referenced)
      && !clean(element.getAttribute('title')) && ![...element.querySelectorAll('img[alt]')].some(image => clean(image.getAttribute('alt')));
  }).length;
  const paragraphs = [...root.querySelectorAll('p')].filter(element => !projectedAnswers.has(element)).map(element => clean(element.textContent)).filter(Boolean);
  const plainText = sourceText(root);
  const facts = freeze({ title, description, canonical, robotsDirectives, titleCount: titles.length, descriptionCount: descriptions.length,
    canonicalCount: canonicals.length, h1Count: headings.filter(value => value.level === 1).length, headingCount: headings.length,
    wordCount: (plainText.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length,
    imageCount: images.length, missingAltCount: images.filter(element => !element.hasAttribute('alt')).length, linkCount: links.length,
    unlabeledLinkCount, externalLinkCount: external.length, jsonLdCount: scripts.length, invalidJsonLdCount,
    questionHeadingCount: headingElements.filter(question).length, answeredQuestionCount: questions.length });
  const sources = [...new Map(external.map(value => [value.url, { label: clip(clean(value.element.textContent) || value.url, 200), url: value.url }])).values()].slice(0, 20);
  const draft = normalizeDraft({ url: canonical || sourceUrl, title: clip(title, 200), description: clip(description, 500),
    heading: clip(headings.find(value => value.level === 1)?.text ?? '', 300), summary: clip(paragraphs[0] ?? '', 2000),
    body: clip(paragraphs.length ? paragraphs.slice(1).join('\n\n') : sourceText(root, new Set([...headingElements, ...projectedAnswers])), 50000),
    questions: questions.slice(0, 10).map(value => ({ question: clip(value.question, 500), answer: clip(value.answer, 5000) })), sources });
  return freeze({ url: sourceUrl, title, description, canonical, headings, ...auditFacts(facts), facts, draft });
}
