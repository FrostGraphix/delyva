# ADR 0002 — ESM monorepo, TypeScript 6.0 and package build strategy

- Status: Accepted
- Date: 2026-11-19

## Context

NestJS 12 ships as ESM only. TypeScript 7.0 (native compiler) is the npm `latest`, but
typescript-eslint 8.73 supports `typescript >=4.8.4 <6.1.0`.

## Decision

1. Every workspace package and Node app is ESM (`"type": "module"`, `module: NodeNext`, explicit `.js`
   import suffixes). Next.js and Expo apps use `moduleResolution: Bundler`.
2. Pin **TypeScript 6.0.3** (latest 6.x) until typescript-eslint supports TS 7.
3. Shared packages compile with `tsc` to `dist/` and are consumed through their `exports` map; Turborepo
   runs `^build` before `lint`, `typecheck`, `test` and `build`.
4. Design tokens and icons have a code-generation step (`scripts/build.mjs`) producing gitignored
   `src/generated/` files plus `dist/tailwind.css` and `dist/tailwind-preset.js`.
5. Tailwind CSS 4 consumes tokens through `@import '@delyva/design-tokens/tailwind.css'` (CSS variables
   for light and dark via `prefers-color-scheme` and `data-theme`). A JS preset is also emitted for any
   Tailwind-config-based consumer.
6. Local dependencies run from `infra/docker-compose.yml` as compose project `delyva`, bound to
   127.0.0.1 on non-default ports (Postgres 55432, Redis 56379) so they never collide with other stacks.

## Consequences

- Revisit TS 7 once typescript-eslint supports it (DEBT).
- Expo `build` is `expo export --platform android` (a real Hermes bundle) rather than EAS Build.
