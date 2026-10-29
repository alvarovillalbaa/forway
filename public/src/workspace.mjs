import { normalizeDraft } from './content.mjs';
import { normalizeObservation } from './observations.mjs';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const bytes = value => new TextEncoder().encode(value).length;

function invalid() {
  const error = new TypeError('This is not a valid Forway workspace. Your current work has been kept.');
  error.code = 'invalid_workspace';
  throw error;
}

function record(value, keys, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable
      || !Object.hasOwn(descriptor, 'value')) invalid();
  }
  if (keys.some(key => !optional.includes(key) && !Object.hasOwn(value, key))) invalid();
  return value;
}

function scalarText(value) {
  if (typeof value !== 'string' || value.includes('\0')) invalid();
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (code >= 0xdc00 && code <= 0xdfff) invalid();
  }
}

function source(value) {
  if (value === null) return null;
  const input = record(value, ['url', 'html', 'headers']);
  if (typeof input.url !== 'string' || !input.url || input.url.length > 2048
    || input.url.trim() !== input.url || /[\u0000-\u0020\u007f]/.test(input.url)) invalid();
  scalarText(input.url);
  let url;
  try { url = new URL(input.url); } catch { invalid(); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) invalid();
  if (typeof input.html !== 'string' || bytes(input.html) > MAX_SOURCE_BYTES) invalid();
  scalarText(input.html);
  const inputHeaders = record(input.headers, ['content-type', 'x-robots-tag'], ['content-type', 'x-robots-tag']);
  const headers = {};
  for (const key of Object.keys(inputHeaders)) {
    const value = inputHeaders[key];
    if (!(key === 'x-robots-tag' && value === null)
      && (typeof value !== 'string' || value.length > 4096 || /[\r\n\u0000]/.test(value))) invalid();
    if (value !== null) scalarText(value);
    headers[key] = value;
  }
  return { url: url.href, html: input.html, headers };
}

function observations(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 500
    || Reflect.ownKeys(value).length !== value.length + 1) invalid();
  const result = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result.push(normalizeObservation(descriptor.value));
  }
  return result;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function normalize(value) {
  const input = record(value, ['version', 'source', 'draft', 'observations']);
  if (input.version !== 1) invalid();
  return freeze({ version: 1, source: source(input.source),
    draft: input.draft === null ? null : normalizeDraft(input.draft),
    observations: observations(input.observations) });
}

export function parseWorkspace(text) {
  try {
    if (typeof text !== 'string' || bytes(text) > MAX_FILE_BYTES) invalid();
    return normalize(JSON.parse(text));
  } catch { invalid(); }
}

export function serializeWorkspace(value) {
  try {
    const text = JSON.stringify(normalize(value), null, 2) + '\n';
    if (bytes(text) > MAX_FILE_BYTES) invalid();
    return text;
  } catch { invalid(); }
}
