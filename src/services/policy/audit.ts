/**
 * Sprint 10 · Policy decision audit log.
 *
 * Immutable, append-only in memory. Every `evaluate()` call — allow, deny,
 * escalate, rate-limited, or conflict — appends one entry. The store
 * interface matches the Sprint 9 audit seam so a future Supabase-backed
 * implementation is a drop-in.
 */
import type { Decision } from "./decision";

export interface DecisionAuditLog {
  append(decision: Decision): void;
  forOfficer(officerId: string): readonly Decision[];
  all(): readonly Decision[];
}

export function createMemoryDecisionAuditLog(): DecisionAuditLog {
  const rows: Decision[] = [];
  return {
    append(d) {
      rows.push(Object.freeze({ ...d }));
    },
    forOfficer(officerId) {
      return rows.filter((r) => r.officerId === officerId);
    },
    all() {
      return rows.slice();
    },
  };
}
