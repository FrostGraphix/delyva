// One-command runner: boots the E2E stack (fresh DB + Redis db 10), waits for readiness, runs the
// Playwright suite, then stops the stack. Needs docker-compose `delyva` up and a built API.
// Set RIDER_E2E_SKIP_EXPORT=1 to reuse an existing web export.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E } from './e2e-env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const stack = spawn(process.execPath, [join(here, 'stack.mjs')], { stdio: 'inherit' });
const stopStack = () => {
  if (stack.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(stack.pid), '/T', '/F']);
    else stack.kill();
  }
};
process.on('exit', stopStack);
process.on('SIGINT', () => process.exit(130));

async function ready() {
  for (let i = 0; i < 200; i += 1) {
    if (stack.exitCode !== null) throw new Error('stack exited before becoming ready');
    try {
      const res = await fetch(`${E2E.webOrigin}/readyz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('stack not ready after 10 minutes');
}

await ready();
const r = spawnSync('pnpm', ['playwright', 'test', '-c', 'tests/e2e/rider/playwright.config.mjs'], {
  stdio: 'inherit',
  shell: true,
  cwd: join(here, '..', '..', '..'),
  env: { ...process.env, RIDER_E2E_EXTERNAL: '1' },
});
stopStack();
process.exit(r.status ?? 1);
