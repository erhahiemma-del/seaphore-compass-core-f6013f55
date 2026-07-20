/**
 * Sprint 9 · Workflow Engine.
 *
 * Trigger → policy check → enqueue → execute with retries → audit every
 * transition. The engine is deterministic and mockable end-to-end.
 */
import { createMockAdapters, type MockAdapters } from "./adapters";
import { HANDLERS } from "./handlers";
import { defaultPolicyEngine, type PolicyEngine } from "./policy";
import { createMemoryQueue, type Queue } from "./queue";
import { assertTransition } from "./state-machine";
import {
  createMemoryAuditLog,
  createMemoryStore,
  type AuditLog,
  type WorkflowStore,
} from "./store";
import type {
  AuditEntry,
  OfficerContext,
  WorkflowId,
  WorkflowRecord,
  WorkflowStatus,
  WorkflowTrigger,
} from "./types";

export interface EngineDeps {
  store?: WorkflowStore;
  audit?: AuditLog;
  queue?: Queue;
  policy?: PolicyEngine;
  adapters?: MockAdapters;
  /** Deterministic clock for tests. */
  now?: () => Date;
  /** id generator — override in tests. */
  newId?: () => string;
  /** Backoff (ms) between retry attempts. Default 0 for tests. */
  retryBackoffMs?: number;
}

export class WorkflowEngine {
  private readonly store: WorkflowStore;
  private readonly audit: AuditLog;
  private readonly queue: Queue;
  private readonly policy: PolicyEngine;
  private readonly adapters: MockAdapters;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly backoff: number;
  private counter = 0;

  constructor(deps: EngineDeps = {}) {
    this.store = deps.store ?? createMemoryStore();
    this.audit = deps.audit ?? createMemoryAuditLog();
    this.queue = deps.queue ?? createMemoryQueue({ concurrency: 4 });
    this.policy = deps.policy ?? defaultPolicyEngine;
    this.adapters = deps.adapters ?? createMockAdapters();
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => `wf_${Date.now().toString(36)}_${(this.counter++).toString(36)}`);
    this.backoff = deps.retryBackoffMs ?? 0;
  }

  /** Fire-and-forget trigger. Returns the run promise for tests / awaited use. */
  trigger(t: WorkflowTrigger): Promise<WorkflowRecord> {
    const decision = this.policy.can(t.officer, t.workflow, t.input);
    const record = this.persist(this.build(t));

    if (!decision.allowed) {
      const denied = this.transition(record, "denied", 0, decision.reason ?? "Policy denied.");
      return Promise.resolve(denied);
    }

    return this.queue.enqueue({
      id: record.id,
      run: () => this.execute(record.id),
    });
  }

  async retry(runId: string): Promise<WorkflowRecord> {
    const existing = this.store.get(runId);
    if (!existing) throw new Error(`Workflow ${runId} not found`);
    if (existing.status !== "failed") throw new Error(`Only failed workflows can be retried (got ${existing.status})`);
    if (existing.attempts >= existing.maxAttempts) {
      throw new Error(`Workflow ${runId} exhausted its retry budget (${existing.maxAttempts})`);
    }
    this.transition(existing, "retrying", existing.attempts, "Retry requested by officer.");
    return this.queue.enqueue({ id: runId, run: () => this.execute(runId) });
  }

  /** Officer-facing history — most recent first. */
  historyFor(officerId: string): readonly WorkflowRecord[] {
    return this.store.list({ officerId });
  }
  auditFor(runId: string): readonly AuditEntry[] {
    return this.audit.forRun(runId);
  }
  officerAudit(officerId: string): readonly AuditEntry[] {
    return this.audit.forOfficer(officerId);
  }
  get(runId: string): WorkflowRecord | undefined {
    return this.store.get(runId);
  }
  list(filter?: Parameters<WorkflowStore["list"]>[0]): readonly WorkflowRecord[] {
    return this.store.list(filter);
  }

  // ── internals ─────────────────────────────────────────────────────────────
  private build(t: WorkflowTrigger): WorkflowRecord {
    const nowIso = this.now().toISOString();
    const handler = HANDLERS[t.workflow];
    return Object.freeze({
      id: this.newId(),
      workflow: t.workflow,
      officer: t.officer,
      input: Object.freeze({ ...t.input }),
      correlationId: t.correlationId,
      status: "pending" as WorkflowStatus,
      attempts: 0,
      maxAttempts: handler.maxAttempts,
      result: null,
      error: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
    });
  }

  private persist(record: WorkflowRecord): WorkflowRecord {
    this.store.put(record);
    this.audit.append({
      at: record.createdAt,
      runId: record.id,
      workflow: record.workflow,
      officerId: record.officer.officerId,
      from: null,
      to: record.status,
      attempt: record.attempts,
      message: "Workflow queued.",
    });
    return record;
  }

  private transition(
    prev: WorkflowRecord,
    to: WorkflowStatus,
    attempts: number,
    message: string,
    patch: Partial<WorkflowRecord> = {},
  ): WorkflowRecord {
    assertTransition(prev.status, to);
    const nowIso = this.now().toISOString();
    const next: WorkflowRecord = Object.freeze({
      ...prev,
      status: to,
      attempts,
      updatedAt: nowIso,
      completedAt: to === "completed" || to === "denied" ? nowIso : prev.completedAt,
      ...patch,
    });
    this.store.put(next);
    this.audit.append({
      at: nowIso,
      runId: next.id,
      workflow: next.workflow,
      officerId: next.officer.officerId,
      from: prev.status,
      to,
      attempt: attempts,
      message,
    });
    return next;
  }

  private async execute(runId: string): Promise<WorkflowRecord> {
    let record = this.store.get(runId);
    if (!record) throw new Error(`Workflow ${runId} vanished before execute()`);

    const handler = HANDLERS[record.workflow];
    const parsed = handler.schema.safeParse(record.input);
    const attemptForValidation = record.attempts + 1;
    if (!parsed.success) {
      const running = this.transition(record, "running", attemptForValidation, `Attempt ${attemptForValidation} started.`);
      return this.transition(running, "failed", attemptForValidation, `Input validation failed: ${parsed.error.message}`, {
        error: parsed.error.message,
      });
    }

    const attempt = record.attempts + 1;
    record = this.transition(record, "running", attempt, `Attempt ${attempt} started.`);

    try {
      const result = await handler.execute(parsed.data, this.adapters);
      return this.transition(record, "completed", attempt, `Attempt ${attempt} completed.`, { result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = this.transition(record, "failed", attempt, `Attempt ${attempt} failed: ${message}`, { error: message });
      // Auto-retry until the budget is exhausted.
      if (attempt < failed.maxAttempts) {
        if (this.backoff > 0) await new Promise((r) => setTimeout(r, this.backoff));
        this.transition(failed, "retrying", attempt, `Auto-retry ${attempt + 1}/${failed.maxAttempts}.`);
        return this.execute(runId);
      }
      return failed;
    }
  }
}
