import type { Role } from '@delyva/contracts';

/** Roles that may sign in to the admin console (ADR 0700: all of them require TOTP 2FA). */
export const CONSOLE_ROLES = [
  'support',
  'ops',
  'finance',
  'super_admin',
] as const satisfies readonly Role[];

/** A console role. */
export type ConsoleRole = (typeof CONSOLE_ROLES)[number];

/** Console sections and the roles the API accepts for them (mirrors the controllers' `@Roles`). */
export const SECTION_ROLES = {
  overview: ['support', 'ops', 'finance', 'super_admin'],
  live: ['ops', 'support', 'super_admin'],
  orderCancel: ['ops', 'super_admin'],
  dispatch: ['ops', 'super_admin'],
  riders: ['ops', 'super_admin'],
  merchants: ['ops', 'super_admin'],
  pricing: ['ops', 'super_admin'],
  flags: ['super_admin'],
  audit: ['support', 'ops', 'finance', 'super_admin'],
} as const satisfies Record<string, readonly ConsoleRole[]>;

/** A console section key. */
export type Section = keyof typeof SECTION_ROLES;

/** True when `roles` contains at least one console role. */
export function hasConsoleRole(roles: readonly string[]): boolean {
  return roles.some((r) => (CONSOLE_ROLES as readonly string[]).includes(r));
}

/** True when `roles` may use `section`. The API enforces the same rule again. */
export function canAccess(section: Section, roles: readonly string[]): boolean {
  const allowed: readonly string[] = SECTION_ROLES[section];
  return roles.some((r) => allowed.includes(r));
}
