/**
 * useRole — convenience hook returning the caller's highest role.
 *
 * Wraps `useRoles` so consumers can `const role = useRole()` for the
 * common single-role case. Client-side hint only — RLS is authoritative.
 * Re-exports `usePermission` for one-stop RBAC imports.
 */
import { useRoles, usePermission } from "@/hooks/use-permissions";
import type { Role, Permission } from "@/lib/permissions";

export function useRole(): { role: Role | null; roles: Role[]; loading: boolean } {
  return useRoles();
}

export { usePermission };
export type { Role, Permission };
