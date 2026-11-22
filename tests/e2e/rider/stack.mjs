// E2E stack for the rider app (not shipped). Prepares a dedicated database + Redis db, exports
// the Expo web build, boots the REAL API on :3321 and serves the web build on :3322 with a
// same-origin reverse proxy to the API (REST, uploads and Socket.IO incl. WebSocket upgrades).
// Requires: docker-compose `delyva` (Postgres 127.0.0.1:55432, Redis 127.0.0.1:56379) and a
// built API (`pnpm --filter @delyva/api build`).
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import pg from 'pg';
import { E2E } from './e2e-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const apiDir = join(root, 'apps', 'api');
const appDir = join(root, 'apps', 'rider-mobile');
const webDir = join(appDir, 'dist-web-e2e');
const log = (m) => process.stdout.write(`[rider-e2e] ${m}\n`);

async function prepareData() {
  const admin = new pg.Client({ connectionString: E2E.adminDbUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${E2E.dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${E2E.dbName}`);
  await admin.end();
  const redis = new Redis(E2E.redisUrl);
  await redis.flushdb(); // db 10 is reserved for this suite
  redis.disconnect();
  for (const script of ['migrate', 'seed-catalog', 'seed-pricing']) {
    const r = spawnSync(process.execPath, [join(apiDir, 'dist', 'scripts', `${script}.js`)], {
      env: { ...process.env, ...E2E.apiEnv },
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error(`${script} failed`);
  }
}

function exportWeb() {
  const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web-e2e', '--clear'], {
    cwd: appDir,
    env: { ...process.env, EXPO_PUBLIC_API_URL: E2E.webOrigin },
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) throw new Error('expo export failed');
}

function startApi() {
  const child = spawn(process.execPath, [join(apiDir, 'dist', 'src', 'main.js')], {
    cwd: apiDir,
    env: { ...process.env, ...E2E.apiEnv },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const stop = () => child.kill();
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  child.on('exit', (code) => {
    log(`api exited (${String(code)})`);
    process.exit(1);
  });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const PROXIED = /^\/(v1|socket\.io|healthz|readyz)(\/|\?|$)/;

function serveStatic(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let file = join(webDir, path);
  if (!file.startsWith(webDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDir, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function proxyHttp(req, res) {
  const upstream = http.request(
    { host: '127.0.0.1', port: E2E.apiPort, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502).end();
  });
  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
  const upstream = net.connect(E2E.apiPort, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}

function startWebServer() {
  const server = http.createServer((req, res) => (PROXIED.test(req.url ?? '') ? proxyHttp(req, res) : serveStatic(req, res)));
  server.on('upgrade', proxyUpgrade);
  server.listen(E2E.webPort, '127.0.0.1', () => log(`web + proxy on ${E2E.webOrigin}`));
}

await prepareData();
if (process.env.RIDER_E2E_SKIP_EXPORT !== '1' || !existsSync(webDir)) exportWeb();
startApi();
startWebServer();
