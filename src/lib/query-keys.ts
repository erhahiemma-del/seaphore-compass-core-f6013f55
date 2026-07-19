/**
 * Canonical React Query keys and default stale times for Seaphore.
 * Spec: PART D — State Management, STATE-3.
 *
 * MUST be the single source of truth. Never write inline query keys anywhere
 * else in the codebase — import from here.
 */

export const QUERY_KEYS = {
  entities: (id?: string) => (id ? (["entities", id] as const) : (["entities"] as const)),
  entitySearch: (q: string) => ["entities", "search", q] as const,
  voyages: (id?: string) => (id ? (["voyages", id] as const) : (["voyages"] as const)),
  investigations: (id?: string) =>
    id ? (["investigations", id] as const) : (["investigations"] as const),
  signals: (domain?: string) =>
    domain ? (["signals", domain] as const) : (["signals"] as const),
  manifests: (id?: string) =>
    id ? (["manifests", id] as const) : (["manifests"] as const),
  revenue: () => ["revenue", "summary"] as const,
  ports: () => ["ports", "congestion"] as const,
  // Cross-cutting infrastructure keys
  dataSources: () => ["data-sources"] as const,
  authRoles: (userId?: string) =>
    userId ? (["auth", "roles", userId] as const) : (["auth", "roles"] as const),
  evidenceLibrary: () => ["evidence", "library"] as const,
  adminUsersWithRoles: () => ["admin", "users-with-roles"] as const,
  adminRoleAudit: (filter?: string) =>
    filter ? (["admin", "role-audit", filter] as const) : (["admin", "role-audit"] as const),
  adminKpiUsers: () => ["admin", "kpi-users"] as const,
} as const;

/**
 * Default staleTime values (ms) per data domain.
 * Consumers should pass these into `useQuery`/`queryOptions`.
 */
export const QUERY_STALE = {
  signals: 30_000, // live feed
  revenue: 60_000,
  entities: 5 * 60_000,
  investigationsOpen: 30_000,
  investigationsClosed: 5 * 60_000,
  voyages: 60_000,
  manifests: 60_000,
  ports: 60_000,
} as const;

export type QueryKeys = typeof QUERY_KEYS;
