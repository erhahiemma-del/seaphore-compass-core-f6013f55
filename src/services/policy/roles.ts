/**
 * Sprint 10 · Role → Permission matrix (RBAC).
 *
 * Roles mirror Sprint 1B and Sprint 9's OfficerContext union. Analysts can
 * only request documents (read-heavy). Officers can open cases, notify, and
 * request docs. Assign/freeze are director+ actions. Administrators inherit
 * everything.
 */
import { PERMISSIONS, type Permission } from "./permissions";

export type Role = "administrator" | "director" | "officer" | "analyst";

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = Object.freeze({
  administrator: new Set<Permission>(PERMISSIONS),
  director: new Set<Permission>([
    "CAN_CREATE_CASE",
    "CAN_NOTIFY_CUSTOMS",
    "CAN_REQUEST_DOCUMENTS",
    "CAN_ASSIGN_OFFICERS",
    "CAN_FREEZE_CLEARANCE",
  ]),
  officer: new Set<Permission>([
    "CAN_CREATE_CASE",
    "CAN_NOTIFY_CUSTOMS",
    "CAN_REQUEST_DOCUMENTS",
  ]),
  analyst: new Set<Permission>(["CAN_REQUEST_DOCUMENTS"]),
});

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
