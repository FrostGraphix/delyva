// Serves the customer web build and proxies /v1 + /socket.io to the local API.
// Usage: node tools/demo-customer.mjs  (API must be running on API_PORT, default 3300)
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
const API_PORT = Number(process.env.API_PORT ?? 3300);
const WEB_PORT = Number(process.env.WEB_PORT ?? 3350);
const dist = resolve('apps/customer-mobile/dist-web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/v1/') || url.startsWith('/socket.io') || url.startsWith('/healthz')) {
    const up = http.request({ host: '127.0.0.1', port: API_PORT, path: url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on('error', () => res.writeHead(502).end());
    req.pipe(up);
    return;
  }
  const p = normalize(decodeURIComponent(url.split('?')[0])).replace(/^[/\\]+/, '');
  let file = join(dist, p);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(WEB_PORT, '127.0.0.1', () => console.log(`Delyva customer app: http://127.0.0.1:${WEB_PORT}`));
