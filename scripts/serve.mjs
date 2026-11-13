import { createServer } from 'node:https';
import { open, realpath, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import audit from '../api/audit.mjs';
import auth from '../api/cloud-auth.mjs';
import settings from '../api/cloud-config.mjs';
import workspaces from '../api/workspaces.mjs';

const routes = new Map([
  ['/api/audit', audit], ['/api/cloud-auth', auth],
  ['/api/cloud-config', settings], ['/api/workspaces', workspaces],
]);
const types = new Map([
  ['html', 'text/html; charset=utf-8'], ['mjs', 'text/javascript; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'], ['css', 'text/css; charset=utf-8'],
  ['svg', 'image/svg+xml'], ['png', 'image/png'], ['jpg', 'image/jpeg'],
  ['json', 'application/json; charset=utf-8'], ['txt', 'text/plain; charset=utf-8'],
]);
function invalidConfig() { throw new Error('server_config_invalid'); }

async function pem(path) {
  if (typeof path !== 'string' || !path) invalidConfig();
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 131072) invalidConfig();
    return await file.readFile();
  } finally { await file.close(); }
}

export async function createForwayServer() {
  const env = process.env;
  const origin = new URL(env.FORWAY_APP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search
    || origin.hash || origin.pathname !== '/') invalidConfig();
  const host = env.FORWAY_BIND_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', '0.0.0.0'].includes(host)) invalidConfig();
  const root = await realpath(fileURLToPath(new URL('../public/', import.meta.url)));
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const tls = { cert: await pem(env.FORWAY_TLS_CERT_FILE), key: await pem(env.FORWAY_TLS_KEY_FILE), minVersion: 'TLSv1.2' };
  const server = createServer({ ...tls, handshakeTimeout: 10000, maxHeaderSize: 32768, requestTimeout: 10000,
    headersTimeout: 5000, keepAliveTimeout: 5000 }, async (req, res) => {
    try {
      if (typeof req.url !== 'string' || !req.url.startsWith('/')) { res.statusCode = 400; res.end('Invalid request.'); return; }
      const url = new URL(req.url, origin);
      if (url.origin !== origin.origin) { res.statusCode = 400; res.end('Invalid request.'); return; }
      for (const rule of config.headers ?? []) {
        if (rule.source === '/(.*)' || rule.source === url.pathname) {
          for (const header of rule.headers) res.setHeader(header.key, header.value);
        }
      }
      const handler = routes.get(url.pathname);
      if (handler) { await handler(req, res); return; }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); res.end('Use GET or HEAD.'); return;
      }
      const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (name.includes('\0') || name.includes('\\') || name.split('/').some(part => part.startsWith('.'))) {
        res.statusCode = 404; res.end('Not found.'); return;
      }
      let path;
      try { path = await realpath(resolve(root, '.' + name)); }
      catch { res.statusCode = 404; res.end('Not found.'); return; }
      if (!path.startsWith(root + sep)) { res.statusCode = 404; res.end('Not found.'); return; }
      const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
      let streamed = false;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 8388608) { res.statusCode = 404; res.end('Not found.'); return; }
        res.setHeader('Content-Type', types.get(path.split('.').at(-1)) ?? 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'HEAD') { res.end(); return; }
        streamed = true;
        await pipeline(file.createReadStream(), res);
      } finally { if (!streamed) await file.close(); }
    } catch {
      if (!res.headersSent && !res.destroyed) { res.statusCode = 500; res.end('The request could not be completed.'); }
      else res.destroy();
    }
  });
  return { server, origin: origin.origin, port: Number(origin.port || 443), host };
}

async function main() {
  const { server, origin, port, host } = await createForwayServer();
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  console.log(`Forway listening at ${origin}`);
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    const timer = setTimeout(() => {
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
    }, 10000);
    timer.unref();
    server.close(() => { clearTimeout(timer); process.exitCode = 0; });
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Forway could not start. Check the HTTPS origin, TLS files and listening port.'); process.exitCode = 1; });
}
