/**
 * Seaphore Permissions Matrix — Part E.
 *
 * SINGLE SOURCE OF TRUTH for client-side authorization checks. RLS in
 * Supabase remains the primary enforcement layer (PERM-1). This module
 * mirrors the same rules so the UI can hide/disable actions the caller
 * cannot perform, avoiding pointless round-trips and confusing errors.
 *
 * NEVER rely on this module for security — it is a UX layer only.
 */

export type Role = "external_agency" | "analyst" | "officer" | "director" | "admin";

/**
 * ROLE_RANK — external_agency is a partner-agency read-only role and
 * sits BELOW analyst so `highestRole` naturally elevates any internal
 * role above it when a user carries both.
 */
export const ROLE_RANK: Record<Role, number> = {
  external_agency: 0,
  analyst: 1,
  officer: 2,
  director: 3,
  admin: 4,
};

export function isOfficerOrAbove(role: Role | null | undefined): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK.officer;
}

/**
 * Permission keys — one per matrix row. Keep in sync with
 * SEAPHORE_Permissions_Matrix.pdf (Part E).
 */
export type Permission =
  | "entity.read"
  | "investigation.create"
  | "investigation.close"
  | "investigation.escalate"
  | "evidence.add"
  | "evidence.delete"
  | "decision.submit"
  | "briefing.send"
  | "briefing.send.officialSensitive"
  | "audit.read.own"
  | "audit.read.team"
  | "audit.read.all"
  | "user.manage"
  | "role.manage"
  | "administration.view"
  | "export.all"
  | "export.own"
  | "watchlist.configure"
  | "apiKey.manage";

/**
 * Roles that satisfy each permission. Matches Part E precisely.
 */
const MATRIX: Record<Permission, ReadonlyArray<Role>> = {
  "entity.read": ["analyst", "officer", "director", "admin"],
  "investigation.create": ["analyst", "officer", "director", "admin"],
  "investigation.close": ["officer", "director", "admin"],
  "investigation.escalate": ["officer", "director", "admin"],
  "evidence.add": ["analyst", "officer", "director", "admin"],
  "evidence.delete": ["admin"],
  "decision.submit": ["officer", "director", "admin"],
  "briefing.send": ["analyst", "officer", "director", "admin"],
  "briefing.send.officialSensitive": ["officer", "director", "admin"],
  "audit.read.own": ["analyst", "officer", "director", "admin"],
  "audit.read.team": ["officer", "director", "admin"],
  "audit.read.all": ["director", "admin"],
  "user.manage": ["admin"],
  "role.manage": ["admin"],
  "administration.view": ["director", "admin"],
  "export.all": ["officer", "director", "admin"],
  "export.own": ["analyst", "officer", "director", "admin"],
  "watchlist.configure": ["officer", "director", "admin"],
  "apiKey.manage": ["admin"],
};

export function can(
  roles: ReadonlyArray<Role> | Role | null | undefined,
  permission: Permission,
): boolean {
  if (!roles) return false;
  const list = Array.isArray(roles) ? roles : [roles];
  const allowed = MATRIX[permission];
  return list.some((r) => allowed.includes(r));
}

export function highestRole(roles: ReadonlyArray<Role> | null | undefined): Role | null {
  if (!roles || roles.length === 0) return null;
  return [...roles].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0];
}
