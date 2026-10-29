import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const PAGE_LIMITS = Object.freeze({ urlCharacters: 2048, bodyBytes: 1024 * 1024,
  headerBytes: 16 * 1024, headerCount: 100, redirects: 4, timeoutMs: 8000 });
const ERRORS = Object.freeze({
  invalid_request: [400, 'Send one JSON object containing only a URL.'],
  invalid_url: [400, 'Enter a complete HTTP or HTTPS page URL using its default port.'],
  url_not_public: [400, 'Only public Internet pages can be imported.'],
  dns_failed: [502, 'The page hostname could not be resolved.'],
  fetch_failed: [502, 'The public page could not be retrieved.'],
  fetch_timeout: [504, 'The page import exceeded its time limit or was cancelled.'],
  redirect_limit: [502, 'The page redirected too many times or repeated a URL.'],
  response_too_large: [413, 'The page exceeds the one MiB import limit.'],
  invalid_headers: [502, 'The page returned unsupported or oversized response headers.'],
  unsupported_content: [422, 'The URL did not return a successful HTML page.'],
  unsupported_encoding: [422, 'The page must return uncompressed UTF-8 HTML.'],
  invalid_utf8: [422, 'The page did not contain valid UTF-8 HTML.'],
});
export class PageImportError extends Error {
  constructor(code) {
    const selected = Object.hasOwn(ERRORS, code) ? code : 'fetch_failed';
    super(ERRORS[selected][1]); this.name = 'PageImportError'; this.code = selected; this.status = ERRORS[selected][0];
  }
}
const fail = code => { throw new PageImportError(code); };

export function validatePageImportInput(input) {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail('invalid_request');
  if (Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, 'url')) fail('invalid_request');
  const field = Object.getOwnPropertyDescriptor(input, 'url');
  if (!field || !Object.hasOwn(field, 'value') || !field.enumerable || typeof field.value !== 'string') fail('invalid_request');
  return { url: field.value };
}

export function validatePublicPageURL(value) {
  if (typeof value !== 'string' || !value || value.length > PAGE_LIMITS.urlCharacters || value.trim() !== value
    || /[\u0000-\u0020\u007f\\]/u.test(value)) fail('invalid_url');
  let url;
  try { url = new URL(value); } catch { fail('invalid_url'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) fail('invalid_url');
  url.hash = '';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) { if (!isPublicIPAddress(host)) fail('url_not_public'); }
  else {
    const name = host.toLowerCase();
    if (name.length > 253 || !name.includes('.') || name.endsWith('.')
      || !name.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
      || /(?:^|\.)(?:localhost|local|internal|lan|home|onion|test|invalid|example)$/i.test(name)
      || name.endsWith('.home.arpa')) fail('url_not_public');
  }
  if (url.href.length > PAGE_LIMITS.urlCharacters) fail('invalid_url');
  return url;
}

function ipv4Number(address) {
  return address.split('.').reduce((value, part) => value * 256 + Number(part), 0);
}
function ipv4In(value, address, bits) {
  const width = 2 ** (32 - bits);
  return Math.floor(value / width) === Math.floor(ipv4Number(address) / width);
}
function ipv6Number(address) {
  const [before, after] = address.toLowerCase().split('::');
  const left = before ? before.split(':') : [], right = after ? after.split(':') : [];
  const words = after === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return words.reduce((value, word) => (value << 16n) | BigInt('0x' + word), 0n);
}
function ipv6In(value, address, bits) {
  return value >> BigInt(128 - bits) === ipv6Number(address) >> BigInt(128 - bits);
}

/** Conservative Internet destination policy, not merely a private-address blacklist. */
export function isPublicIPAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return ![['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
      ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4]].some(([network, bits]) => ipv4In(value, network, bits))
      && address !== '168.63.129.16'; // Azure's platform/metadata virtual address.
  }
  if (family !== 6 || address.includes('.')) return false;
  const value = ipv6Number(address);
  // Only 2000::/3 global unicast; deny protocol, transition, documentation and retired allocations.
  return ipv6In(value, '2000::', 3)
    && ![['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16],
      ['3fff::', 20], ['2620:4f:8000::', 48]].some(([network, bits]) => ipv6In(value, network, bits));
}

/** The request retains its original hostname; this callback performs no DNS lookup. */
export function createPinnedLookup(address, family) {
  if (!isPublicIPAddress(address) || isIP(address) !== family) fail('url_not_public');
  return (_hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function abortRace(promise, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => { dispose(); reject(new PageImportError('fetch_timeout')); };
    const dispose = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(value => { dispose(); signal.aborted ? aborted() : resolve(value); },
      error => { dispose(); reject(error); });
    if (signal.aborted) aborted();
  });
}

async function resolveAll(hostname) { return lookup(hostname, { all: true, verbatim: true }); }

function requestPinned(url, { address, family, signal }) {
  return new Promise((resolve, reject) => {
    let response, request;
    const close = () => {
      signal.removeEventListener('abort', aborted);
      response?.destroy(); request?.destroy();
    };
    const aborted = () => { close(); reject(new PageImportError('fetch_timeout')); };
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    try {
      request = transport(url, {
        method: 'GET', agent: false, family, autoSelectFamily: false,
        lookup: createPinnedLookup(address, family), maxHeaderSize: PAGE_LIMITS.headerBytes,
        headers: { Accept: 'text/html, application/xhtml+xml;q=0.9', 'Accept-Encoding': 'identity',
          'User-Agent': 'Forway/0.1 public-page-import' },
      }, incoming => {
        response = incoming;
        if (signal.aborted) { close(); return; }
        const headers = [];
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) headers.push([incoming.rawHeaders[index], incoming.rawHeaders[index + 1]]);
        resolve({ status: incoming.statusCode, headers, body: incoming, close });
      });
      request.maxHeadersCount = 0; // Inspect all headers under the parser's byte cap, without silent truncation.
      request.once('error', () => { close(); reject(new PageImportError(signal.aborted ? 'fetch_timeout' : 'fetch_failed')); });
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted(); else request.end();
    } catch { close(); reject(new PageImportError('fetch_failed')); }
  });
}

function readHeaders(pairs) {
  if (!Array.isArray(pairs) || pairs.length > PAGE_LIMITS.headerCount) fail('invalid_headers');
  const result = new Map(); let bytes = 0;
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(value => typeof value !== 'string')) fail('invalid_headers');
    const [name, value] = pair;
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
    if (bytes > PAGE_LIMITS.headerBytes || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n\0]/.test(value)) fail('invalid_headers');
    const key = name.toLowerCase();
    if (result.has(key) && ['content-type', 'content-length', 'content-encoding', 'location'].includes(key)) fail('invalid_headers');
    result.set(key, result.has(key) ? result.get(key) + ', ' + value.trim() : value.trim());
    if (['content-type', 'x-robots-tag'].includes(key) && result.get(key).length > 4096) fail('invalid_headers');
  }
  return result;
}

function closeResponse(response) {
  try { Promise.resolve(response?.close?.()).catch(() => {}); } catch { /* Cleanup cannot replace the public outcome. */ }
}

function safeFailure(error, fallback) {
  try { if (error instanceof PageImportError) return new PageImportError(error.code); } catch { /* Opaque thrown values are untrusted. */ }
  return new PageImportError(fallback);
}

export async function fetchPublicPage(input, adapters = {}) {
  const supplied = validatePageImportInput(input);
  let url = validatePublicPageURL(supplied.url);
  const { resolve = resolveAll, request = requestPinned, now = () => new Date(), signal: external,
    timeoutMs = PAGE_LIMITS.timeoutMs } = adapters;
  if (typeof resolve !== 'function' || typeof request !== 'function' || typeof now !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PAGE_LIMITS.timeoutMs
    || external !== undefined && !(external instanceof AbortSignal)) fail('invalid_request');
  const controller = new AbortController(), signal = controller.signal;
  const deadline = performance.now() + timeoutMs;
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  external?.addEventListener('abort', cancel, { once: true });
  if (external?.aborted) cancel();
  const guard = () => { if (performance.now() >= deadline) cancel(); if (signal.aborted) fail('fetch_timeout'); };
  const within = async operation => {
    guard();
    const value = await abortRace(Promise.resolve().then(() => { guard(); return operation(); }), signal);
    guard(); return value;
  };
  const visited = new Set(); let redirects = 0;
  try {
    while (true) {
      guard();
      if (visited.has(url.href)) fail('redirect_limit');
      visited.add(url.href);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      let records;
      try { records = isIP(host) ? [{ address: host, family: isIP(host) }] : await within(() => resolve(host, { signal })); }
      catch (error) { throw safeFailure(error, 'dns_failed'); }
      if (!Array.isArray(records) || !records.length || records.length > 32
        || records.some(record => !record || !isPublicIPAddress(record.address) || isIP(record.address) !== record.family)) fail('url_not_public');
      const { address, family } = records[0];
      let response, responseClosed = false;
      const closeOwned = () => {
        if (response && !responseClosed) { responseClosed = true; closeResponse(response); }
      };
      try {
        const pending = Promise.resolve().then(() => { guard(); return request(url, { address, family, signal }); });
        pending.then(value => { response = value; if (signal.aborted) closeOwned(); }, () => {});
        response = await within(() => pending);
        if (!response || !Number.isInteger(response.status)) fail('fetch_failed');
        const headers = readHeaders(response.headers);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= PAGE_LIMITS.redirects || !headers.get('location')) fail('redirect_limit');
          let target;
          try { target = new URL(headers.get('location'), url); } catch { fail('invalid_url'); }
          url = validatePublicPageURL(target.href); redirects += 1;
          continue;
        }
        if (response.status < 200 || response.status >= 300) fail('unsupported_content');
        const contentType = headers.get('content-type') ?? '';
        if (!['text/html', 'application/xhtml+xml'].includes(contentType.split(';', 1)[0].trim().toLowerCase())) fail('unsupported_content');
        const charsets = [...contentType.matchAll(/;\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/gi)].map(match => (match[1] ?? match[2]).toLowerCase());
        if (charsets.length > 1 || charsets.some(charset => !['utf-8', 'utf8', 'us-ascii'].includes(charset))
          || headers.has('content-encoding') && headers.get('content-encoding').toLowerCase() !== 'identity') fail('unsupported_encoding');
        let declared = null;
        if (headers.has('content-length')) {
          if (!/^[0-9]+$/.test(headers.get('content-length'))) fail('invalid_headers');
          declared = Number(headers.get('content-length'));
          if (!Number.isSafeInteger(declared) || declared > PAGE_LIMITS.bodyBytes) fail('response_too_large');
        }
        const chunks = []; let bytes = 0;
        const add = chunk => {
          if (!(chunk instanceof Uint8Array)) fail('fetch_failed');
          bytes += chunk.byteLength;
          if (bytes > PAGE_LIMITS.bodyBytes) fail('response_too_large');
          chunks.push(Buffer.from(chunk));
        };
        if (response.body instanceof Uint8Array) add(response.body);
        else {
          const iterator = response.body?.[Symbol.asyncIterator]?.();
          if (!iterator) fail('fetch_failed');
          try {
            while (true) { const next = await within(() => iterator.next()); if (next.done) break; add(next.value); }
          } finally {
            try { Promise.resolve(iterator.return?.()).catch(() => {}); } catch { /* Cleanup cannot extend the deadline. */ }
          }
        }
        guard();
        if (declared !== null && declared !== bytes) fail('fetch_failed');
        const body = Buffer.concat(chunks, bytes);
        if (charsets.includes('us-ascii') && body.some(byte => byte > 127)) fail('invalid_utf8');
        let html;
        try { html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body); } catch { fail('invalid_utf8'); }
        const timestamp = now();
        if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) fail('fetch_failed');
        guard();
        return { url: url.href, html, status: response.status,
          headers: { 'content-type': contentType, 'x-robots-tag': headers.get('x-robots-tag') ?? null },
          fetchedAt: timestamp.toISOString(), redirects };
      } finally { closeOwned(); }
    }
  } catch (error) { throw safeFailure(error, signal.aborted ? 'fetch_timeout' : 'fetch_failed'); }
  finally { clearTimeout(timer); external?.removeEventListener('abort', cancel); }
}
