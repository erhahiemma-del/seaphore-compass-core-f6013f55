/**
 * RequirePermission — declarative UI gate for the Seaphore permissions
 * matrix. Renders `children` only when the current officer satisfies
 * the permission; otherwise renders `fallback` (default: nothing).
 *
 * This is a UX affordance. Server-side RLS is the authoritative check.
 */
import type { ReactNode } from "react";

import { usePermission } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/permissions";

interface RequirePermissionProps {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}

export function RequirePermission({
  permission,
  fallback = null,
  children,
}: RequirePermissionProps) {
  const allowed = usePermission(permission);
  return <>{allowed ? children : fallback}</>;
}
