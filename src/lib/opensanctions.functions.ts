/**
 * OpenSanctions — server-function gateway.
 *
 * Thin wrappers only (see `tanstack-serverfn-splitting`): every runtime
 * path lives in `@/lib/server/opensanctions.server`, which is blocked
 * from client bundles. The API key never crosses this boundary — no
 * response carries the value or any fragment of it.
 *
 * Credential management is admin-only, verified with `has_role` through
 * the caller's own RLS-scoped client before any privileged work.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type {
  CredentialStatus,
  EntityDetail,
  ValidationOutcome,
} from "@/lib/server/opensanctions.server";
import type { SanctionsScreeningFinding } from "@/lib/sanctions/match-state";

type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

async function assertAdmin(context: AuthedContext): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Unable to verify caller role");
  if (data !== true) throw new Error("Forbidden — admin role required");
}

export const getOpenSanctionsCredentialStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CredentialStatus> => {
    await assertAdmin(context as AuthedContext);
    const { getCredentialStatus } = await import("@/lib/server/opensanctions.server");
    return getCredentialStatus();
  });

export const testOpenSanctionsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ValidationOutcome> => {
    await assertAdmin(context as AuthedContext);
    const { validateCredential, touchValidation } = await import(
      "@/lib/server/opensanctions.server"
    );
    const outcome = await validateCredential();
    if (outcome.authenticated) await touchValidation(outcome.checkedAt);
    return outcome;
  });

/**
 * Rotate the credential. The candidate is validated BEFORE it replaces
 * anything; a failing key leaves the existing credential untouched.
 * The key is never echoed back, logged, or written to the audit record.
 */
export const rotateOpenSanctionsCredential = createServerFn({ method: "POST" })
  .inputValidator((data: { apiKey: string }) => {
    const key = typeof data?.apiKey === "string" ? data.apiKey.trim() : "";
    if (key.length < 8 || key.length > 500) throw new Error("API key format looks invalid");
    return { apiKey: key };
  })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      data,
      context,
    }): Promise<{ replaced: boolean; validation: ValidationOutcome; status: CredentialStatus }> => {
      await assertAdmin(context as AuthedContext);
      const { rotateCredential, getCredentialStatus } = await import(
        "@/lib/server/opensanctions.server"
      );
      const result = await rotateCredential(data.apiKey, context.userId);
      if (result.replaced) {
        await context.supabase.from("audit_log").insert({
          officer_id: context.userId,
          action: "PROVIDER_CREDENTIAL_ROTATED",
          entity: "provider_credential",
          entity_id: "opensanctions",
          module: "administration",
          rule_refs: ["HR-9"],
          // Deliberately no key material, length, or fingerprint.
          metadata: { provider: "OpenSanctions", validated: true },
        });
      }
      return { ...result, status: await getCredentialStatus() };
    },
  );

/** Screening path — POST /match/{dataset}. Never called from the browser. */
export const screenEntityAgainstSanctions = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; kind?: string; imo?: string; dataset?: string }) => {
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    if (!name) throw new Error("name is required");
    return {
      name: name.slice(0, 200),
      kind: typeof data.kind === "string" ? data.kind.toLowerCase().slice(0, 40) : undefined,
      imo: typeof data.imo === "string" ? data.imo.replace(/[^0-9]/g, "").slice(0, 10) : undefined,
      dataset: typeof data.dataset === "string" ? data.dataset.slice(0, 60) : undefined,
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<SanctionsScreeningFinding> => {
    const { screenEntity } = await import("@/lib/server/opensanctions.server");
    return screenEntity(data);
  });

/** Candidate detail — GET /entities/{id}. */
export const getSanctionsEntityDetail = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    const id = typeof data?.id === "string" ? data.id.trim() : "";
    if (!id) throw new Error("id is required");
    return { id: id.slice(0, 120) };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<EntityDetail | { error: string }> => {
    const { entityDetail } = await import("@/lib/server/opensanctions.server");
    return entityDetail(data.id);
  });
