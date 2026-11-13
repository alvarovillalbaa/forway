// Transparent observation of actual Node DNS/HTTP/TLS. Never manufacture a response.
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const sha = data => createHash('sha256').update(data).digest('hex');
const capture = bytes => ({ bytes: bytes.length, sha256: sha(bytes), gzipBase64: gzipSync(bytes).toString('base64') });
const HOST = 'forway.vercel.app';

export function observeNativeNetwork() {
  const originals = { lookup: dns.lookup, http: http.request, https: https.request };
  const records = { dns: [], requests: [], harnessRefusals: [], observerErrors: [] };
  const sockets = new Set();
  let identity = null;
  const guard = (kind, value) => {
    records.harnessRefusals.push({ identity, kind, value });
    throw new Error('Unowned network target refused by check harness');
  };
  dns.lookup = async function (...args) {
    const row = { identity, hostname: args[0], options: args[1], startedAt: Date.now() };
    records.dns.push(row);
    if (args[0] !== HOST) return guard('dns', String(args[0]));
    try {
      const result = await originals.lookup.apply(this, args);
      row.records = structuredClone(result); row.finishedAt = Date.now(); return result;
    } catch (error) { row.error = error.code ?? error.message; throw error; }
  };
  function wrap(original) {
    return function (input, options, callback) {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== HOST || url.port || url.username || url.password
        || url.pathname !== '/api/check-fixtures/native-page') return guard('request', url.href);
      const row = { identity, url: url.href, startedAt: Date.now(), lookupCalls: [], chunks: [], capturedBytes: 0,
        iteratorOpened: 0, iteratorReturned: false, bodyDone: false, requestClosed: false, responseClosed: false, socketClosed: false };
      records.requests.push(row);
      const lookup = options.lookup;
      if (typeof lookup !== 'function') throw new Error('Expected actual pinned lookup');
      const forwarded = { ...options, lookup(host, lookupOptions, done) {
        const entry = { hostname: host, options: lookupOptions }; row.lookupCalls.push(entry);
        return lookup(host, lookupOptions, (...values) => {
          entry.error = values[0]?.code ?? null; entry.result = structuredClone(values.slice(1)); return done(...values);
        });
      } };
      const req = original.call(this, input, forwarded, response => {
        row.status = response.statusCode; row.rawHeaders = [...response.rawHeaders];
        const iterate = response[Symbol.asyncIterator];
        response[Symbol.asyncIterator] = function (...args) {
          row.iteratorOpened++;
          const actual = iterate.apply(this, args);
          return {
            next(...values) {
              return Promise.resolve(actual.next(...values)).then(result => {
                if (result.done) row.bodyDone = true;
                else {
                  const bytes = Buffer.from(result.value); row.capturedBytes += bytes.length;
                  if (row.capturedBytes > 2 * 1024 * 1024) throw new Error('Owned capture limit exceeded');
                  row.chunks.push(bytes);
                }
                return result;
              });
            },
            return(...values) { row.iteratorReturned = true; return actual.return ? actual.return(...values) : Promise.resolve({ done: true }); },
            [Symbol.asyncIterator]() { return this; },
          };
        };
        response.once('close', () => { row.responseClosed = true; row.messageComplete = response.complete; });
        callback(response);
      });
      row.method = req.method; row.hostHeader = req.getHeader('host');
      row.outgoingHeaders = Object.fromEntries(['accept', 'accept-encoding', 'user-agent'].map(name => [name, req.getHeader(name)]));
      row.credentialsSent = req.hasHeader('authorization') || req.hasHeader('cookie');
      req.once('socket', socket => {
        sockets.add(socket);
        socket.once('secureConnect', () => {
          row.peer = { address: socket.remoteAddress, family: socket.remoteFamily, port: socket.remotePort,
            authorized: socket.authorized, servername: socket.servername, protocol: socket.getProtocol() };
        });
        socket.once('close', () => { sockets.delete(socket); row.socketClosed = true; });
      });
      req.once('error', error => { row.requestError = error.code ?? error.message; });
      req.once('close', () => { row.requestClosed = true; row.finishedAt = Date.now(); });
      return req;
    };
  }
  http.request = wrap(originals.http); https.request = wrap(originals.https); syncBuiltinESMExports();
  return {
    records,
    select(value) { identity = value; },
    async close() {
      dns.lookup = originals.lookup; http.request = originals.http; https.request = originals.https; syncBuiltinESMExports();
      const until = Date.now() + 3000;
      while (sockets.size && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
      const forced = sockets.size;
      if (forced) for (const socket of sockets) socket.destroy();
      for (const row of records.requests) {
        row.body = { ...capture(Buffer.concat(row.chunks)), complete: row.bodyDone };
        delete row.chunks;
      }
      return { liveSockets: sockets.size, forcedSocketCloses: forced };
    },
  };
}
