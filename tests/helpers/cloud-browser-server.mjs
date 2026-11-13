import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Disposable browser fixture: static candidate assets only; no live backend.
if (process.env.FORWAY_BROWSER_FIXTURE !== 'authored-api') throw new Error('Fixture admission required.');
const root = fileURLToPath(new URL('../../public/', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^[A-Za-z0-9/._-]+$/.test(name) || name.split('/').includes('..') || name.startsWith('api/')) throw new Error();
    const file = path.resolve(root, name); if (!file.startsWith(root)) throw new Error();
    res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.setHeader('Cache-Control', 'no-store'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
server.listen(43179, '127.0.0.1');
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
