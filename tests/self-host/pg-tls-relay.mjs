// Fixture-only TLS termination. PostgreSQL authentication and query bytes stay real.
import { createServer, connect } from 'node:net';
import { createSecureContext, TLSSocket } from 'node:tls';

export async function pgTlsRelay({ cert, key, port, upstreamPort }) {
  const context = createSecureContext({ cert, key, minVersion: 'TLSv1.2' });
  const sockets = new Set(); let sessions = 0;
  const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); return socket; };
  const server = createServer(raw => {
    track(raw); raw.setTimeout(10000, () => raw.destroy());
    raw.on('error', () => raw.destroy());
    let hello = Buffer.alloc(0);
    const initial = chunk => {
      hello = Buffer.concat([hello, chunk]);
      if (hello.length < 8) return;
      raw.removeListener('data', initial);
      if (hello.length !== 8 || hello.readUInt32BE(0) !== 8 || hello.readUInt32BE(4) !== 80877103) { raw.destroy(); return; }
      raw.pause(); raw.write('S');
      const secure = track(new TLSSocket(raw, { isServer: true, secureContext: context }));
      const timer = setTimeout(() => secure.destroy(), 5000); timer.unref();
      secure.on('error', () => secure.destroy());
      secure.once('close', () => clearTimeout(timer));
      secure.once('secure', () => {
        clearTimeout(timer); sessions++;
        const backend = track(connect({ host: '127.0.0.1', port: upstreamPort }));
        backend.setTimeout(10000, () => backend.destroy());
        backend.on('error', () => secure.destroy());
        secure.once('close', () => backend.destroy()); backend.once('close', () => secure.destroy());
        secure.pipe(backend).pipe(secure);
      });
      secure.resume();
    };
    raw.on('data', initial);
  });
  server.maxConnections = 16;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { get sessions() { return sessions; }, async close() {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    if (sockets.size) await new Promise(resolve => setImmediate(resolve));
    return sockets.size === 0;
  } };
}
