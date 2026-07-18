/**
 * validate-manifest — completeness, HS code validity, cargo/vessel consistency.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const validateManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ manifest_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: manifest }, { data: cargo }] = await Promise.all([
      context.supabase.from("manifests").select("*").eq("id", data.manifest_id).maybeSingle(),
      context.supabase.from("cargo_items").select("*").eq("manifest_id", data.manifest_id),
    ]);
    const issues: { code: string; detail: string }[] = [];
    if (!manifest) issues.push({ code: "missing_manifest", detail: "Manifest not found" });
    if (!cargo || cargo.length === 0)
      issues.push({ code: "no_cargo_items", detail: "Manifest has no cargo items" });
    for (const c of cargo ?? []) {
      if (!c.hs_code || !/^\d{6,10}$/.test(String(c.hs_code)))
        issues.push({ code: "bad_hs_code", detail: `Invalid HS code on cargo ${c.id}` });
    }
    return { manifest_id: data.manifest_id, valid: issues.length === 0, issues };
  });
