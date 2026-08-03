/**
 * Sprint 6 · Agent Framework — shared types.
 * Layer 2.2 (Component Responsibilities) · Layer 2.7 (Capability Registry).
 *
 * Every specialist agent is stateless and reproducible:
 *   input  → { entityIds, query, signal, ctx }
 *   output → { agent, status, data|error, partial, sourcesQueried, latencyMs }
 *
 * The scheduler owns concurrency and timeouts. Agents own their query logic
 * against a whitelisted set of `DataSource`s declared in the registry.
 */
import type { z } from "zod";

export type AgentId = "ownership" | "revenue" | "compliance" | "manifest" | "evidence" | "forecast";

export type DataSourceId =
  | "cac_registry"
  | "company_registry"
  | "sanctions_list"
  | "customs_db"
  | "invoice_db"
  | "manifest_db"
  | "container_db"
  | "certificate_registry"
  | "isps_registry"
  | "port_state_db"
  | "document_store"
  | "evidence_library"
  | "historical_db"
  | "pattern_engine";

export type AgentStatus = "ok" | "partial" | "error" | "timeout";

export interface AgentInput {
  /** Entities the query is scoped to (vessel IMOs, company ids, etc.). */
  entityIds: string[];
  /** Free-text query — agents may use it as a hint but must not require it. */
  query: string;
  /** Optional investigation id for audit correlation. */
  investigationId?: string;
}

export interface AgentContext {
  /** Cancellation signal — MUST be forwarded to every downstream call. */
  signal: AbortSignal;
  /** Correlation id for logs / audit. */
  requestId: string;
  /** Wall-clock at scheduler dispatch. */
  dispatchedAt: number;
}

export interface AgentResult<T> {
  agent: AgentId;
  status: AgentStatus;
  data: T | null;
  partial: boolean;
  sourcesQueried: DataSourceId[];
  latencyMs: number;
  error?: { code: string; message: string };
}

export interface AgentSpec<TSchema extends z.ZodTypeAny> {
  id: AgentId;
  description: string;
  /** Whitelisted data sources — Capability Registry enforcement. */
  allowedSources: readonly DataSourceId[];
  outputSchema: TSchema;
  execute: (
    input: AgentInput,
    ctx: AgentContext,
    query: <T>(source: DataSourceId, args: Record<string, unknown>) => Promise<T>,
  ) => Promise<z.infer<TSchema>>;
}
