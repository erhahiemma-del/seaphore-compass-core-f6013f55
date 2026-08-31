/**
 * Cesium Ion — server-only credential boundary.
 *
 * The token is never written into the repository and never lives in a
 * client module. It is read from the configured environment
 * (`CESIUM_ION_TOKEN`) or, when an administrator has activated one
 * through the modal, from `public.provider_credentials` — the same
 * deny-all table every other rotated provider credential uses.
 *
 * Cesium runs in the browser, so the token has to reach the browser to
 * draw anything. What this module guarantees is that it reaches only an
 * authenticated officer, at request time, from a validated source, and
 * that its origin (environment or officer-supplied) is always stated
 * rather than assumed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const CESIUM_PROVIDER_ID = "cesium-ion";

/** Where the active token came from. Never the token itself. */
export type CesiumTokenOrigin = "environment" | "stored" | "none";

export interface CesiumIonStatus {
  /** Whether a token exists at all. */
  readonly configured: boolean;
  readonly origin: CesiumTokenOrigin;
  /** Last four characters, for recognition without disclosure. */
  readonly hint: string | null;
  /** ISO timestamp of the last successful upstream validation. */
  readonly validatedAt: string | null;
  readonly rotatedAt: string | null;
  /** Officer-facing explanation when the token is absent or rejected. */
  readonly message: string | null;
}

type Db = SupabaseClient<never, never, never>;

function hintOf(token: string): string {
  return token.length <= 4 ? "••••" : `••••${token.slice(-4)}`;
}

function envToken(): string | null {
  const raw = process.env["CESIUM_ION_TOKEN"] ?? process.env["VITE_CESIUM_ION_TOKEN"] ?? "";
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

interface StoredRow {
  secret: string;
  rotated_at: string | null;
  last_validated_at: string | null;
}

async function readStored(db: Db): Promise<StoredRow | null> {
  const { data, error } = await db
    .from("provider_credentials")
    .select("secret, rotated_at, last_validated_at")
    .eq("provider", CESIUM_PROVIDER_ID)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as StoredRow;
}

/**
 * Resolve the active token, environment first.
 *
 * Environment wins because it is the deployment's own decision: an
 * operator who set a token in configuration should not have it silently
 * shadowed by a row somebody added in the UI months earlier.
 */
export async function resolveCesiumToken(
  db: Db,
): Promise<{ token: string; origin: CesiumTokenOrigin } | null> {
  const fromEnv = envToken();
  if (fromEnv) return { token: fromEnv, origin: "environment" };
  const stored = await readStored(db);
  if (stored?.secret) return { token: stored.secret, origin: "stored" };
  return null;
}

export async function cesiumIonStatus(db: Db): Promise<CesiumIonStatus> {
  const fromEnv = envToken();
  if (fromEnv) {
    return {
      configured: true,
      origin: "environment",
      hint: hintOf(fromEnv),
      validatedAt: null,
      rotatedAt: null,
      message: null,
    };
  }
  const stored = await readStored(db);
  if (stored?.secret) {
    return {
      configured: true,
      origin: "stored",
      hint: hintOf(stored.secret),
      validatedAt: stored.last_validated_at ?? null,
      rotatedAt: stored.rotated_at ?? null,
      message: null,
    };
  }
  return {
    configured: false,
    origin: "none",
    hint: null,
    validatedAt: null,
    rotatedAt: null,
    message:
      "No Cesium Ion token configured. The 3D intelligence view is unavailable until one is activated — this is a configuration gap, not a data outage.",
  };
}

export interface CesiumValidation {
  readonly ok: boolean;
  /** Ion account or token name, when the upstream reports one. */
  readonly account: string | null;
  readonly httpStatus: number | null;
  readonly message: string | null;
}

/**
 * Validate a token against Cesium Ion before it is trusted.
 *
 * A token that cannot be confirmed is never stored: an activated-looking
 * control that fails on first camera move is worse than an honest
 * "rejected".
 */
export async function validateCesiumToken(token: string): Promise<CesiumValidation> {
  try {
    const response = await fetch("https://api.cesium.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        account: null,
        httpStatus: response.status,
        message: "Cesium Ion rejected this token. Check it was copied in full and is not revoked.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        account: null,
        httpStatus: response.status,
        message: `Cesium Ion returned HTTP ${response.status}. The token was not stored.`,
      };
    }
    const body = (await response.json()) as { username?: string; email?: string };
    return {
      ok: true,
      account: body.username ?? body.email ?? null,
      httpStatus: response.status,
      message: null,
    };
  } catch (error) {
    return {
      ok: false,
      account: null,
      httpStatus: null,
      message: `Cesium Ion is unreachable from the server: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/** Store a validated token. Admin authorisation happens in the caller. */
export async function storeCesiumToken(
  db: Db,
  token: string,
  officerId: string,
): Promise<CesiumIonStatus> {
  const now = new Date().toISOString();
  const { error } = await db.from("provider_credentials").upsert(
    {
      provider: CESIUM_PROVIDER_ID,
      secret: token,
      rotated_at: now,
      rotated_by: officerId,
      last_validated_at: now,
    } as never,
    { onConflict: "provider" },
  );
  if (error) throw new Error(`Could not store the Cesium Ion token: ${error.message}`);
  return {
    configured: true,
    origin: envToken() ? "environment" : "stored",
    hint: hintOf(token),
    validatedAt: now,
    rotatedAt: now,
    message: envToken()
      ? "Stored. The environment token still takes precedence for this deployment."
      : null,
  };
}
