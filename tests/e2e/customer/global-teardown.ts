/** Stops the API and web server started by global-setup. */
export default function globalTeardown(): void {
  const s = (globalThis as { __e2e?: { api?: { kill: () => void }; web?: { close: () => void } } })
    .__e2e;
  s?.api?.kill();
  s?.web?.close();
}
