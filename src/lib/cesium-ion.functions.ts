/**
 * Cesium Ion — server-function gateway.
 *
 * Thin wrappers only. The token is resolved, validated and stored inside
 * `@/lib/server/cesium-ion.server`, which is blocked from client bundles.
 * Nothing here embeds a credential, and no unauthenticated path exists:
 * the 3D view is an officer capability, not a public one.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CesiumIonStatus } from "@/lib/server/cesium-ion.server";

type Db = SupabaseClient<never, never, never>;

export type { CesiumIonStatus };

/** Is a token configured, where did it come from, and when was it checked. */
export const getCesiumIonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CesiumIonStatus> => {
    const { cesiumIonStatus } = await import("@/lib/server/cesium-ion.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return cesiumIonStatus(supabaseAdmin as unknown as Db);
  });

/**
 * Hand the active token to an authenticated officer's browser session.
 *
 * Cesium Ion's access tokens are client-side by design — the globe asks
 * Ion for terrain and imagery directly. What is not acceptable is a token
 * baked into the bundle for anyone to read, so it is fetched per session
 * and only after authentication.
 */
export const getCesiumIonRuntimeToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<{
      token: string | null;
      origin: "environment" | "stored" | "none";
      message: string | null;
    }> => {
      const { resolveCesiumToken } = await import("@/lib/server/cesium-ion.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const resolved = await resolveCesiumToken(supabaseAdmin as unknown as Db);
      if (!resolved) {
        return {
          token: null,
          origin: "none",
          message:
            "No Cesium Ion token configured. The 3D intelligence view is unavailable until one is activated.",
        };
      }
      return { token: resolved.token, origin: resolved.origin, message: null };
    },
  );

/**
 * Activate a token an administrator pasted into the modal.
 *
 * Validated upstream before it is stored, and rejected tokens are
 * reported with the reason rather than saved optimistically.
 */
export const activateCesiumIonToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().trim().min(20).max(4_000) }).parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      account: string | null;
      message: string | null;
      status: CesiumIonStatus | null;
    }> => {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) {
        return {
          ok: false,
          account: null,
          message: "Only an administrator may activate provider credentials.",
          status: null,
        };
      }

      const { validateCesiumToken, storeCesiumToken } =
        await import("@/lib/server/cesium-ion.server");
      const validation = await validateCesiumToken(data.token);
      if (!validation.ok) {
        return { ok: false, account: null, message: validation.message, status: null };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const status = await storeCesiumToken(
        supabaseAdmin as unknown as Db,
        data.token,
        context.userId,
      );

      // Audit trail: who activated a credential, and when. Never the value.
      await (context.supabase as unknown as Db).from("audit_log").insert({
        officer_id: context.userId,
        action: "PROVIDER_CREDENTIAL_ACTIVATED",
        entity: "provider_credential",
        entity_id: "cesium-ion",
        module: "geospatial-3d",
        rule_refs: ["HR-9"],
        metadata: { provider: "cesium-ion", account: validation.account, hint: status.hint },
        ip_address: "server",
      } as never);

      return { ok: true, account: validation.account, message: null, status };
    },
  );
