/**
 * Sprint 9 · In-memory Workflow Store + Audit Log.
 *
 * Interfaces are the contract; the in-memory implementations satisfy the
 * Sprint 9 spec. Sprint 12 can swap them for Supabase-backed stores without
 * touching the engine.
 */
import type { AuditEntry, WorkflowId, WorkflowRecord, WorkflowStatus } from "./types";

export interface WorkflowStore {
  put(record: WorkflowRecord): void;
  get(id: string): WorkflowRecord | undefined;
  list(filter?: { officerId?: string; workflow?: WorkflowId; status?: WorkflowStatus }): readonly WorkflowRecord[];
}

export interface AuditLog {
  append(entry: AuditEntry): void;
  forRun(runId: string): readonly AuditEntry[];
  forOfficer(officerId: string): readonly AuditEntry[];
  all(): readonly AuditEntry[];
}

export function createMemoryStore(): WorkflowStore {
  const rows = new Map<string, WorkflowRecord>();
  return {
    put(record) {
      rows.set(record.id, record);
    },
    get(id) {
      return rows.get(id);
    },
    list(filter) {
      const all = Array.from(rows.values());
      return all
        .filter((r) => !filter?.officerId || r.officer.officerId === filter.officerId)
        .filter((r) => !filter?.workflow || r.workflow === filter.workflow)
        .filter((r) => !filter?.status || r.status === filter.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

export function createMemoryAuditLog(): AuditLog {
  const entries: AuditEntry[] = [];
  return {
    append(entry) {
      entries.push(entry);
    },
    forRun(runId) {
      return entries.filter((e) => e.runId === runId);
    },
    forOfficer(officerId) {
      return entries.filter((e) => e.officerId === officerId);
    },
    all() {
      return entries.slice();
    },
  };
}
