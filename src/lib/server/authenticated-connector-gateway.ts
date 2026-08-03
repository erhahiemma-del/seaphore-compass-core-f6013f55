/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE — AUTHENTICATED CONNECTOR GATEWAY (pattern)
 * ─────────────────────────────────────────────────────────────────────
 *
 * The standard architecture for every intelligence connector that
 * requires a secret (API key, bearer token, OAuth credentials).
 *
 * Reference implementation: Global Fishing Watch
 *   • Server helper : src/lib/server/gfw.server.ts       (reads env)
 *   • RPC wrappers  : src/lib/gfw.functions.ts           (createServerFn)
 *   • Client proxy  : src/connectors/global-fishing-watch (thin)
 *
 * Rules — every future authenticated connector MUST follow:
 *
 *   1. `process.env.<SECRET>` is read ONLY inside a `.handler()` body
 *      of a `createServerFn` in a `<name>.functions.ts` file (which
 *      itself imports logic from a `<name>.server.ts` module).
 *   2. The `.server.ts` module is the sole owner of Authorization
 *      headers and outbound HTTP to the provider.
 *   3. The `.functions.ts` file contains only server-fn declarations
 *      and imports — no runtime helpers, constants, or demo data.
 *   4. The client-side connector is a proxy: it invokes the server
 *      function, receives a sanitised Evidence Package, and publishes
 *      evidence to OSAE. It never handles credentials.
 *   5. The client bundle MUST contain no reference to the secret name
 *      or any `VITE_<SECRET>` alias — enforced by grep in the health
 *      check tests and by the projection contract registry.
 *   6. Errors surface as a typed `{ code, message }` on the returned
 *      DTO — never as raw provider bodies.
 *
 * This file is intentionally documentation + a minimal typed helper.
 * The pattern is deliberately expressed as convention (folder layout +
 * splitting rules) rather than an inheritance base class, because
 * `createServerFn` chains cannot be produced from a superclass.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Structured error surface shared by every authenticated connector. */
export type ConnectorGatewayErrorCode =
  "CREDENTIALS_MISSING" | "AUTH_FAILED" | "UPSTREAM_ERROR" | "RATE_LIMITED" | "TIMEOUT";

export interface ConnectorGatewayError {
  code: ConnectorGatewayErrorCode;
  message: string;
}

export interface ConnectorGatewayResult<T> {
  package: T | null;
  error?: ConnectorGatewayError;
}

/**
 * Server-side helper: read a required secret from `process.env`,
 * throwing a well-known error when it is absent. Call only from
 * within a `createServerFn` handler.
 */
export function requireServerSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    const err = new Error(`Missing ${name}`);
    (err as Error & { code?: string }).code = "CREDENTIALS_MISSING";
    throw err;
  }
  return value;
}
