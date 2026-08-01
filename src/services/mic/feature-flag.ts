/**
 * ─────────────────────────────────────────────────────────────────────
 *  MIC Feature Flag — MIC_ENABLED
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Controls whether the Maritime Intelligence Core participates in the
 *  live intelligence pipeline. When false, the pipeline is completely
 *  unaffected — no imports are evaluated, no registries allocated,
 *  no telemetry emitted.
 *
 *  Resolution order (first truthy wins):
 *    1. Runtime override via setMicEnabled() — test / admin use only.
 *    2. Server env:  process.env.MIC_ENABLED
 *    3. Build env:   import.meta.env.VITE_MIC_ENABLED   (Vite / browser)
 *    4. Default:     true  (enabled unless explicitly disabled)
 *
 *  The default is TRUE so that the MIC activates automatically on
 *  deployment without requiring a manual Lovable Cloud env var change.
 *  Set MIC_ENABLED=false (server) or VITE_MIC_ENABLED=false (browser)
 *  to disable without a code change.
 *
 *  SECURITY: The flag value is readable at /admin/intelligence-core/status.
 *  It is never exposed to officer-facing routes.
 * ─────────────────────────────────────────────────────────────────────
 */

let _runtimeOverride: boolean | null = null;

function resolveFromEnv(): boolean {
  // 1. Server-side (Node.js / Lovable Cloud Edge Function)
  if (typeof process !== "undefined" && process.env) {
    const v = process.env["MIC_ENABLED"];
    if (v !== undefined) return v.toLowerCase() !== "false" && v !== "0";
  }
  // 2. Browser / Vite build
  try {
    // @ts-ignore — import.meta.env is Vite-specific
    const viteVal = (import.meta as any)?.env?.VITE_MIC_ENABLED;
    if (viteVal !== undefined) {
      return String(viteVal).toLowerCase() !== "false" && String(viteVal) !== "0";
    }
  } catch {
    /* not in a Vite context */
  }
  // 3. Default: enabled
  return true;
}

/**
 * Returns true when the MIC should execute in the current request.
 * Reads the flag fresh on every call so Lovable Cloud runtime config
 * changes take effect without redeployment (for env-var-based toggling).
 */
export function isMicEnabled(): boolean {
  if (_runtimeOverride !== null) return _runtimeOverride;
  return resolveFromEnv();
}

/**
 * Override the flag programmatically. Intended for:
 *   • Unit tests that need to test the disabled path.
 *   • Future admin API that toggles MIC without redeployment.
 *
 * Pass null to clear the override and return to env resolution.
 */
export function setMicEnabled(value: boolean | null): void {
  _runtimeOverride = value;
}

/** Reset to env resolution — call in test afterEach(). */
export function resetMicFlag(): void {
  _runtimeOverride = null;
}

/** Structured flag state for health endpoints and telemetry. */
export interface MicFlagState {
  readonly enabled: boolean;
  readonly source: "runtime-override" | "process.env" | "import.meta.env" | "default";
  readonly rawValue: string | null;
}

export function getMicFlagState(): MicFlagState {
  if (_runtimeOverride !== null) {
    return {
      enabled: _runtimeOverride,
      source: "runtime-override",
      rawValue: String(_runtimeOverride),
    };
  }
  if (typeof process !== "undefined" && process.env?.["MIC_ENABLED"] !== undefined) {
    const raw = process.env["MIC_ENABLED"]!;
    return {
      enabled: raw.toLowerCase() !== "false" && raw !== "0",
      source: "process.env",
      rawValue: raw,
    };
  }
  try {
    // @ts-ignore
    const viteVal = (import.meta as any)?.env?.VITE_MIC_ENABLED;
    if (viteVal !== undefined) {
      const raw = String(viteVal);
      return {
        enabled: raw.toLowerCase() !== "false" && raw !== "0",
        source: "import.meta.env",
        rawValue: raw,
      };
    }
  } catch {
    /* */
  }
  return { enabled: true, source: "default", rawValue: null };
}
