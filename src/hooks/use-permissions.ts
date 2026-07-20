/**
 * useRoles / usePermission — client-side role & permission hooks.
 *
 * Reads the caller's roles from `public.user_roles` via RLS (users can
 * always read their own rows). Cached in React Query. Do NOT use for
 * security-critical gating — RLS is authoritative.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { QUERY_KEYS } from "@/lib/query-keys";
import { can, highestRole, type Permission, type Role } from "@/lib/permissions";
import { useIsDevBypass, useDevModeStore } from "@/stores/dev-mode.store";

export function useRoles(): {
  roles: Role[];
  role: Role | null;
  loading: boolean;
} {
  const bypass = useIsDevBypass();
  const mockRole = useDevModeStore((s) => s.mockRole);
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const query = useQuery({
    queryKey: QUERY_KEYS.authRoles(userId ?? undefined),
    enabled: !!userId && !bypass,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Role[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as Role);
    },
  });

  const roles = bypass ? ([mockRole] as Role[]) : (query.data ?? []);
  const role = useMemo(() => highestRole(roles), [roles]);
  return {
    roles,
    role,
    loading: bypass ? false : authLoading || (!!userId && query.isLoading),
  };
}

export function usePermission(permission: Permission): boolean {
  const { roles } = useRoles();
  return can(roles, permission);
}
