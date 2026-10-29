const FIELDS = ['url', 'title', 'description', 'heading', 'summary', 'body', 'questions', 'sources'];
const invalid = () => { throw new TypeError('Invalid page draft.'); };

function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) invalid();
  for (const key of actual) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(field, 'value') || !field.enumerable) invalid();
  }
  return value;
}
function text(value, maximum, nonblank = false) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0') || (nonblank && !value.trim())) invalid();
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (code >= 0xdc00 && code <= 0xdfff) invalid();
  }
  return value;
}
function list(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(index));
    if (!entry || !Object.hasOwn(entry, 'value') || !entry.enumerable) invalid();
  }
  return value;
}
function href(value, blank = false) {
  text(value, 2048);
  if (blank && value === '') return '';
  if (!value || value.trim() !== value || /[\u0000-\u0020\u007f]/u.test(value)) invalid();
  let url;
  try { url = new URL(value); } catch { invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) invalid();
  return url.href;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/** Validate portable draft data; incomplete top-level text and an empty URL survive. */
export function normalizeDraft(value) {
  const input = record(value, FIELDS);
  return freeze({ url: href(input.url, true), title: text(input.title, 200), description: text(input.description, 500),
    heading: text(input.heading, 300), summary: text(input.summary, 2000), body: text(input.body, 50000),
    questions: list(input.questions, 10).map(value => {
      const row = record(value, ['question', 'answer']);
      return { question: text(row.question, 500), answer: text(row.answer, 5000) };
    }),
    sources: list(input.sources, 20).map(value => {
      const row = record(value, ['label', 'url']);
      return { label: text(row.label, 200), url: href(row.url, true) };
    }) });
}
function publishable(value) {
  const draft = normalizeDraft(value);
  if (!draft.url || !draft.title.trim() || !draft.heading.trim()) throw new TypeError('A page URL, title and heading are required for HTML export.');
  if (draft.questions.some(row => !row.question.trim() || !row.answer.trim()) || draft.sources.some(row => !row.label.trim() || !row.url)) {
    throw new TypeError('Complete each question, answer and source before HTML export.');
  }
  return draft;
}
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const lines = value => escape(value).replace(/\r\n?|\n/g, '<br>');
function metadata(draft) {
  return [`<title>${escape(draft.title)}</title>`, `<meta name="description" content="${escape(draft.description)}">`,
    `<link rel="canonical" href="${escape(draft.url)}">`, `<meta property="og:title" content="${escape(draft.title)}">`,
    `<meta property="og:description" content="${escape(draft.description)}">`, `<meta property="og:url" content="${escape(draft.url)}">`].join('\n');
}
export function createMetadata(value) { return metadata(publishable(value)); }

/** Standalone escaped content; FAQ data describes exactly the visible authored Q&A. */
export function createHtml(value) {
  const draft = publishable(value);
  const faq = draft.questions.length ? `<section aria-label="Questions and answers"><h2>Questions and answers</h2>\n${draft.questions.map(row => `<section><h3>${escape(row.question)}</h3><p>${lines(row.answer)}</p></section>`).join('\n')}</section>` : '';
  const structured = draft.questions.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: draft.questions.map(row => ({ '@type': 'Question', name: row.question, acceptedAnswer: { '@type': 'Answer', text: row.answer } }))
  }).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)}</script>` : '';
  const sources = draft.sources.length ? `<section aria-label="Sources"><h2>Sources</h2><ul>${draft.sources.map(row => `<li><a href="${escape(row.url)}" rel="noopener noreferrer">${escape(row.label)}</a></li>`).join('')}</ul></section>` : '';
  const paragraphs = draft.body.split(/\r?\n\s*\r?\n/).filter(value => value.trim()).map(value => `<p>${lines(value)}</p>`).join('\n');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n${metadata(draft)}\n${structured}\n</head><body><main><h1>${escape(draft.heading)}</h1>\n${draft.summary ? `<p>${lines(draft.summary)}</p>` : ''}\n${paragraphs}\n${faq}\n${sources}</main></body></html>\n`;
}
