const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const invalid = () => { throw new TypeError('Use a well-formed UTF-8 URL-set or sitemap-index XML document without DTD/entity declarations or extensions.'); };
const namePattern = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
function validScalar(text) {
  for (const char of text) { const c = char.codePointAt(0); if (!(c === 9 || c === 10 || c === 13 || c >= 32 && c <= 0xd7ff || c >= 0xe000 && c <= 0xfffd || c >= 0x10000 && c <= 0x10ffff)) invalid(); }
}
function entities(text) {
  if (text.includes(']]>')) invalid();
  const value = text.replace(/&([^;]*);/g, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) invalid();
    const point = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isInteger(point) || point > 0x10ffff) invalid();
    const scalar = String.fromCodePoint(point); validScalar(scalar); return scalar;
  });
  if (/&(?:[^;]*$|[^;]*[<&])/u.test(text) || /&(?![^&;]*;)/u.test(text)) invalid();
  return value;
}

/** Strict protocol subset, not a general XML parser. No expansion or external I/O. */
export function parseSitemap(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(input)) invalid();
  let text = input.replace(/^\uFEFF/, ''); validScalar(text);
  const declaration = text.match(/^<\?xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])[uU][tT][fF]-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>/);
  if (declaration) text = text.slice(declaration[0].length);
  const stack = [], urls = []; let position = 0, root = null, closed = false, prefix = '', entry = null;
  while (position < text.length) {
    if (text.startsWith('<!--', position)) {
      const end = text.indexOf('-->', position + 4); if (end < 0 || text.slice(position + 4, end).includes('--')) invalid(); position = end + 3; continue;
    }
    if (text[position] !== '<') {
      const end = text.indexOf('<', position), stop = end < 0 ? text.length : end;
      const data = text.slice(position, stop); position = stop;
      if (stack.length === 3) entry.values[stack.at(-1)] += entities(data);
      else if (data.trim()) invalid();
      continue;
    }
    let end = position + 1, quote = null;
    for (; end < text.length; end++) { const char = text[end]; if (quote) { if (char === quote) quote = null; } else if (char === '"' || char === "'") quote = char; else if (char === '>') break; else if (char === '<') invalid(); }
    if (end === text.length || quote) invalid();
    const markup = text.slice(position + 1, end); position = end + 1;
    if (markup.startsWith('/')) {
      const closing = /^\/([A-Za-z_][A-Za-z0-9_.:-]*)\s*$/.exec(markup); const name = closing?.[1];
      if (!name || !stack.length || name !== prefix + stack.at(-1)) invalid();
      const current = stack.pop();
      if (stack.length === 1) {
        const location = entry.values.loc?.trim(); if (!location || location.length >= 2048 || /[\u0000-\u0020\u007f\\]/u.test(location)) invalid();
        let url; try { url = new URL(location); } catch { invalid(); }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) invalid();
        url.hash = ''; urls.push(url.href); entry = null;
      }
      if (!stack.length) { if (current !== root) invalid(); closed = true; }
      continue;
    }
    const token = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/.exec(markup); if (!token || closed) invalid();
    const attributes = new Map(); let rest = token[2]; let empty = false;
    while (rest.trim()) {
      if (/^\s*\/$/.test(rest)) { empty = true; rest = ''; break; }
      const match = /^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(rest);
      if (!match || attributes.has(match[1])) invalid(); attributes.set(match[1], entities(match[2] ?? match[3])); rest = rest.slice(match[0].length);
    }
    if (!root) {
      const parts = token[1].split(':'); if (parts.length > 2 || ['xml', 'xmlns'].includes(parts[0])) invalid(); root = parts.at(-1); prefix = parts.length === 2 ? parts[0] + ':' : '';
      if (!['urlset', 'sitemapindex'].includes(root) || attributes.get(prefix ? 'xmlns:' + parts[0] : 'xmlns') !== NS) invalid();
      for (const key of attributes.keys()) if (key !== (prefix ? 'xmlns:' + parts[0] : 'xmlns')
        && !(key === 'xmlns:xsi' && attributes.get(key) === 'http://www.w3.org/2001/XMLSchema-instance')
        && !(key === 'xsi:schemaLocation' && attributes.get('xmlns:xsi') === 'http://www.w3.org/2001/XMLSchema-instance')) invalid();
    } else if (attributes.size) invalid();
    const qualified = token[1]; if (!qualified.startsWith(prefix)) invalid(); const name = qualified.slice(prefix.length);
    if (!namePattern.test(name) || name.includes(':')) invalid();
    if (stack.length === 0) { if (name !== root) invalid(); }
    else if (stack.length === 1) { if (name !== (root === 'urlset' ? 'url' : 'sitemap')) invalid(); entry = { values: {} }; }
    else if (stack.length === 2) { if (!(root === 'urlset' ? ['loc', 'lastmod', 'changefreq', 'priority'] : ['loc', 'lastmod']).includes(name) || Object.hasOwn(entry.values, name)) invalid(); entry.values[name] = ''; }
    else invalid();
    if (empty) { if (stack.length !== 0 || root === null) invalid(); closed = true; }
    else stack.push(name);
  }
  if (!root || !closed || stack.length || urls.length > 50_000) invalid();
  return { kind: root === 'urlset' ? 'pages' : 'sitemaps', urls };
}
