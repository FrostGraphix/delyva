/** Server-only runtime configuration for the vendor portal BFF (never exposed to the browser). */
export interface ServerConfig {
  /** Origin of the Delyva API as seen from the Next server, e.g. `http://127.0.0.1:3300`. */
  readonly apiUrl: string;
  /** Extra origins allowed to send mutating requests (besides the request's own host). */
  readonly allowedOrigins: readonly string[];
}

/** Reads and validates server configuration from the environment. @throws when misconfigured */
export function serverConfig(): ServerConfig {
  const apiUrl = process.env.DELYVA_API_URL;
  if (!apiUrl || !/^https?:\/\//.test(apiUrl)) {
    throw new Error('DELYVA_API_URL must be set to the API origin (http(s)://…)');
  }
  const allowedOrigins = (process.env.VENDOR_WEB_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { apiUrl: apiUrl.replace(/\/$/, ''), allowedOrigins };
}
