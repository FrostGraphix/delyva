import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { API_PORT, WEB_PORT } from './env.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

/**
 * One origin for the web build and the API: static files with SPA fallback, `/v1` and
 * `/socket.io` proxied to the API (the API has no CORS yet; websocket upgrades are not proxied,
 * so Socket.IO stays on long-polling, which the app supports).
 */
export function startWebServer(distDir: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/v1/') || url.startsWith('/socket.io') || url.startsWith('/healthz')) {
      const up = http.request(
        { host: '127.0.0.1', port: API_PORT, path: url, method: req.method, headers: req.headers },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      up.on('error', () => {
        res.writeHead(502).end();
      });
      req.pipe(up);
      return;
    }
    const path = normalize(decodeURIComponent(url.split('?')[0] ?? '/')).replace(/^([/\\])+/, '');
    let file = join(distDir, path);
    if (!file.startsWith(distDir) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(distDir, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(WEB_PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}
