/**
 * Officer map preferences — durable, credential-free.
 *
 * The only thing persisted here is *which lens the officer chose*: a
 * boolean saying the 3D Terrain Perspective was the last view they asked
 * for. It follows the officer across sessions and devices because it is
 * stored against their own row under RLS, not in browser storage.
 *
 * No token, no hint, no provider state. The Cesium Ion credential is
 * resolved per session by `@/lib/cesium-ion.functions` and never written
 * anywhere a browser can read it back.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Db = SupabaseClient<never, never, never>;

export interface OfficerMapPreferences {
  /** Whether the officer last chose the 3D Terrain Perspective. */
  readonly terrain3d: boolean;
}

/** Read the officer's own preference row. Absent means "2D", the default. */
export const getOfficerMapPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OfficerMapPreferences> => {
    const { data } = await (context.supabase as unknown as Db)
      .from("officer_map_preferences")
      .select("terrain_3d")
      .eq("user_id", context.userId)
      .maybeSingle();
    const row = data as unknown as { terrain_3d?: boolean } | null;
    return { terrain3d: Boolean(row?.terrain_3d) };
  });

/** Record the officer's lens choice. Written under their own RLS row. */
export const setOfficerTerrainPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ terrain3d: z.boolean() }).parse(data))
  .handler(async ({ data, context }): Promise<OfficerMapPreferences> => {
    const { error } = await (context.supabase as unknown as Db)
      .from("officer_map_preferences")
      .upsert(
        { user_id: context.userId, terrain_3d: data.terrain3d } as never,
        { onConflict: "user_id" },
      );
    // A preference that could not be stored must not break the lens the
    // officer just asked for — it simply will not survive the session.
    if (error) return { terrain3d: data.terrain3d };
    return { terrain3d: data.terrain3d };
  });
