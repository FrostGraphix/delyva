import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

/** Socket origin (the API) as a ws(s) source for connect-src. */
function realtimeSources(): string[] {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!url) return [];
  const u = new URL(url);
  const ws = `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`;
  return [u.origin, ws];
}

// DEBT(web): script-src allows 'unsafe-inline' for Next's inline bootstrap scripts — nonce-based CSP needs a proxy.ts per-request nonce — add nonces and drop 'unsafe-inline'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${realtimeSources().join(' ')}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const config: NextConfig = {
  reactStrictMode: true,
  // Dev-only: lets the E2E browser use 127.0.0.1 without Next blocking HMR.
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
};

export default config;
