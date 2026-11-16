export const ROBOT_TOKEN = 'Forway';
const bytes = value => new TextEncoder().encode(value).length;
const invalid = () => { throw new TypeError('Robots policy could not be parsed within its supported limits.'); };

function normalized(value, pattern = false) {
  return value.replace(/%[0-9a-f]{2}|[^\x00-\x7f]|[*$]/gu, (part, offset) => {
    if (part.startsWith('%')) {
      const char = String.fromCharCode(parseInt(part.slice(1), 16));
      return /[a-zA-Z0-9._~-]/.test(char) ? char : part.toUpperCase();
    }
    if (pattern && (part === '*' || part === '$' && offset === value.length - 1)) return part;
    return encodeURIComponent(part).replace(/\*/g, '%2A').replace(/\$/g, '%24');
  });
}

/** Ordered literal segments avoid constructing a backtracking regex from robots. */
function matches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split('*');
  if (!path.startsWith(parts[0])) return false;
  let position = parts[0].length;
  if (parts.length === 1) return !anchored || position === path.length;
  const tail = parts.at(-1);
  const boundary = anchored ? path.length - tail.length : path.length;
  if (anchored && (boundary < position || !path.endsWith(tail))) return false;
  for (let index = 1; index < parts.length; index++) {
    if (anchored && index === parts.length - 1) return position <= boundary;
    const at = path.indexOf(parts[index], position);
    if (at < 0 || at > boundary) return false;
    position = at + parts[index].length;
  }
  return true;
}

export function parseRobots(text, token = ROBOT_TOKEN) {
  if (typeof text !== 'string' || bytes(text) > 1024 * 1024 || !/^[a-z_-]+$/i.test(token)) invalid();
  const groups = [], sitemaps = [];
  let group = null, hasRules = false;
  for (const original of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = original.split('#', 1)[0].trim();
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (key === 'sitemap') { if (value.length <= 2048) sitemaps.push(value); continue; }
    if (key === 'user-agent') {
      if (!/^(?:[a-z_-]+|\*)$/i.test(value)) continue;
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      if (!group) continue;
      hasRules = true;
      if (!value || !/^[/*]/.test(value) || /[\u0000-\u0020\u007f]/u.test(value)) continue;
      const pattern = normalized(value, true);
      group.rules.push({ allow: key === 'allow', pattern,
        specificity: pattern.replace(/[*$]/g, '').replace(/%[a-f0-9]{2}/gi, 'x').length });
    }
  }
  const exact = groups.filter(g => g.agents.includes(token.toLowerCase()));
  const selected = exact.length ? exact : groups.filter(g => g.agents.includes('*'));
  const rules = selected.flatMap(g => g.rules).sort((a, b) => b.specificity - a.specificity || Number(b.allow) - Number(a.allow));
  return Object.freeze({ token, sitemaps: Object.freeze([...new Set(sitemaps)]),
    allows(value) {
      const url = new URL(value); if (url.pathname === '/robots.txt') return true;
      const path = normalized(url.pathname + url.search);
      return rules.find(rule => matches(rule.pattern, path))?.allow ?? true;
    } });
}
