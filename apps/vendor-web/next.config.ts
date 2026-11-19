import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // DEBT(web): strict CSP + HSTS headers not configured yet — needs final asset/CDN hosts — add in Phase 1 hardening.
};

export default config;
