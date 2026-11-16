const FIELDS = ['mainCount', 'controlCount', 'unnamedControlCount',
  'linkCount', 'nativeLinkCount', 'formCount', 'nativeFormCount'];
const invalid = () => { throw new TypeError('Invalid agent source facts.'); };
const clean = value => (value ?? '').replace(/\s+/gu, ' ').trim();

export function auditAgentFacts(value) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== FIELDS.length) invalid();
  const facts = {};
  for (const key of FIELDS) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field?.enumerable || !Object.hasOwn(field, 'value') || !Number.isSafeInteger(field.value) || field.value < 0) invalid();
    facts[key] = field.value;
  }
  if (facts.unnamedControlCount > facts.controlCount || facts.nativeLinkCount > facts.linkCount
    || facts.nativeFormCount > facts.formCount) invalid();
  const checks = [];
  const add = (id, label, status, detail, recommendation) => checks.push(Object.freeze({ id, area: 'agents', label, status, detail, recommendation }));
  add('agent-main', 'A main content landmark', facts.mainCount === 1 ? 'pass' : 'review',
    `${facts.mainCount} main landmark(s) in source.`,
    'Review one main content landmark for the page. Source presence does not prove rendered accessibility or a successful agent journey.');
  if (facts.linkCount) add('agent-links', 'Links with native destinations', facts.nativeLinkCount === facts.linkCount ? 'pass' : 'review',
    `${facts.nativeLinkCount} of ${facts.linkCount} source links have an HTTP(S) destination, including same-page fragments.`,
    'Use real link destinations for navigation. Keep actions as buttons; verify keyboard and agent navigation in the rendered page.');
  if (facts.controlCount) add('agent-controls', 'Names for interactive controls', facts.unnamedControlCount ? 'review' : 'pass',
    `${facts.unnamedControlCount} of ${facts.controlCount} controls lack an observed text, label, ARIA, image-alt or title name.`,
    'Give meaningful controls accessible names. Inspect the actual accessibility tree, keyboard interaction and dynamic states before accepting the fix.');
  if (facts.formCount) add('agent-forms', 'Native form submission structure', facts.nativeFormCount === facts.formCount ? 'pass' : 'review',
    `${facts.nativeFormCount} of ${facts.formCount} non-dialog forms declare a GET/POST method and a valid HTTP(S) action, including default actions.`,
    'Review the form destination and method. Preserve security, validation and confirmation behavior; a source action does not establish that submission works.');
  const counts = { pass: 0, review: 0, fail: 0 };
  checks.forEach(check => { counts[check.status]++; });
  return Object.freeze({ facts: Object.freeze(facts), checks: Object.freeze(checks), counts: Object.freeze(counts) });
}

/** Source signals only. The detached template is never mounted or executed. */
export function analyzeAgentSource({ html, url }) {
  if (typeof html !== 'string' || html.includes('\0') || new TextEncoder().encode(html).length > 1024 * 1024) invalid();
  for (const character of html) { const code = character.codePointAt(0); if (code >= 0xd800 && code <= 0xdfff) invalid(); }
  let source;
  try { source = new URL(url); } catch { invalid(); }
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) invalid();
  const template = document.createElement('template'); template.innerHTML = html;
  const root = template.content;
  const native = value => {
    try { const target = new URL(value, source); return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password; }
    catch { return false; }
  };
  const baseElement = root.querySelector('base[href]');
  if (baseElement && native(baseElement.getAttribute('href'))) source = new URL(baseElement.getAttribute('href'), source);
  for (const node of root.querySelectorAll('script,style,template,noscript,[hidden],[aria-hidden="true"]')) node.remove();
  const ids = new Map();
  for (const node of root.querySelectorAll('[id]')) if (!ids.has(node.id)) ids.set(node.id, node);
  const labels = [...root.querySelectorAll('label[for]')];
  const named = node => {
    if (clean((node.getAttribute('aria-labelledby') ?? '').split(/\s+/u).map(id => ids.get(id)?.textContent ?? '').join(' '))) return true;
    if (clean(node.getAttribute('aria-label')) || clean(node.getAttribute('title'))) return true;
    if (node.id && labels.some(label => label.getAttribute('for') === node.id && clean(label.textContent))) return true;
    if (clean(node.closest('label')?.textContent)) return true;
    const type = (node.getAttribute('type') ?? '').toLowerCase();
    if (node.tagName === 'INPUT' && ['submit', 'reset'].includes(type)) return !node.hasAttribute('value') || Boolean(clean(node.getAttribute('value')));
    if (node.tagName === 'INPUT' && type === 'button' && clean(node.getAttribute('value'))) return true;
    if (node.tagName === 'INPUT' && type === 'image' && clean(node.getAttribute('alt'))) return true;
    return node.tagName === 'BUTTON' && (Boolean(clean(node.textContent))
      || [...node.querySelectorAll('img[alt]')].some(image => clean(image.getAttribute('alt'))));
  };
  const controls = [...root.querySelectorAll('button,input,select,textarea')]
    .filter(node => (node.getAttribute('type') ?? '').toLowerCase() !== 'hidden');
  const links = [...root.querySelectorAll('a[href]')];
  const forms = [...root.querySelectorAll('form')].filter(node => (node.getAttribute('method') ?? '').toLowerCase() !== 'dialog');
  return auditAgentFacts({ mainCount: root.querySelectorAll('main,[role="main"]').length,
    controlCount: controls.length, unnamedControlCount: controls.filter(node => !named(node)).length,
    linkCount: links.length, nativeLinkCount: links.filter(node => native(node.getAttribute('href'))).length,
    formCount: forms.length, nativeFormCount: forms.filter(node => ['get', 'post'].includes((node.getAttribute('method') || 'get').toLowerCase())
      && native(node.getAttribute('action') ?? '')).length });
}
