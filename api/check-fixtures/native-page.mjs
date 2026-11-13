// Owned public fixtures for explicit native transport checks; no caller data is reflected.
import { FIXTURE_VERSION, HTML, INELIGIBLE_REDIRECT } from '../../tests/fixtures/native-network.mjs';

export default function nativePage(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Forway-Fixture', FIXTURE_VERSION);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method !== 'GET') {
    res.statusCode = 405; res.setHeader('Allow', 'GET'); res.end(); return;
  }
  let url;
  try { url = new URL(req.url, 'https://forway.vercel.app'); }
  catch { res.statusCode = 400; res.end(); return; }
  const parameters = [...url.searchParams];
  const selected = parameters.length === 1 && parameters[0][0] === 'case' ? parameters[0][1] : '';
  switch (selected) {
    case 'ok': res.end(HTML); return;
    case 'redirect':
    case 'ineligible-redirect':
      res.statusCode = 307;
      res.setHeader('Location', selected === 'redirect' ? '/api/check-fixtures/native-page?case=ok' : INELIGIBLE_REDIRECT);
      res.end(); return;
    case 'invalid-utf8': res.end(Buffer.from([0xc3, 0x28])); return;
    case 'oversize': {
      const body = Buffer.alloc(1024 * 1024 + 1, 0x61);
      res.setHeader('Content-Length', String(body.length)); res.end(body); return;
    }
    case 'unsupported':
      res.setHeader('Content-Type', 'application/json'); res.end('{"authored":true}'); return;
    case 'slow': {
      // Streaming lets the check distinguish body cancellation from cold-start failure.
      res.write('<!doctype html><html><title>Owned delayed body</title>');
      const timer = setTimeout(() => { dispose(); if (!res.destroyed) res.end('</html>'); }, 6000);
      const dispose = () => { clearTimeout(timer); res.removeListener('close', dispose); };
      res.once('close', dispose); return;
    }
    default: res.statusCode = 400; res.end();
  }
}
