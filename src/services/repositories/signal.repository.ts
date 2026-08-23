import { listSignals } from "@/lib/api/signals.functions";
import type { ConfidenceLevel } from "@/lib/data-model/confidence";
import { toChipTier } from "@/lib/data-model/confidence";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import type { RiskLevel } from "@/components/intelligence/RiskPill";
import type { ListOptions, ListResult, Repository, Id } from "./types";

/**
 * DB row shape for public.signals.
 * Display fields (title, detail, status, vessel, IMO, investigationId, type)
 * are stored in the metadata JSONB column so the schema stays generic.
 */
export interface SignalRow {
  id: string;
  domain: string;
  severity: string;
  confidence: ConfidenceLevel;
  entity_id?: string | null;
  observed_at: string;
  statement: string;
  metadata: Record<string, unknown> | null;
}

export type SignalDomain =
  | "Manifest"
  | "Cargo"
  | "Revenue"
  | "Vessel Movement"
  | "Port Operations"
  | "Ownership"
  | "Compliance"
  | "Alerts";

export type SignalStatus = "NEW" | "ACK";
export type SignalType =
  "Anomalies" | "Discrepancies" | "Duplicates" | "Changes" | "Gaps" | "Matches";

/** UI-facing signal (mapped from SignalRow via repository). */
export interface Signal {
  id: string;
  title: string;
  detail: string;
  domain: SignalDomain;
  risk: RiskLevel;
  confidence: ConfidenceTier;
  detectedAt: string;
  detectedLabel: string;
  status: SignalStatus;
  entityId?: string;
  investigationId?: string;
  vessel?: string;
  imo?: string;
  type?: SignalType;
}

export interface SignalListFilters extends ListOptions {
  domain?: SignalDomain | "All";
  from?: string;
  to?: string;
}

function unwrap<T>(env: unknown, fallback: T): T {
  const asEnv = env as { data?: T } | null | undefined;
  return asEnv?.data ?? (env as T) ?? fallback;
}

function relativeLabel(iso: string, now = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  return `${d} d ago`;
}

function severityToRisk(sev: string): RiskLevel {
  const up = sev.toUpperCase();
  if (up === "HIGH" || up === "MEDIUM" || up === "LOW") return up as RiskLevel;
  return "LOW";
}

function domainOf(raw: string): SignalDomain {
  const allowed: SignalDomain[] = [
    "Manifest",
    "Cargo",
    "Revenue",
    "Vessel Movement",
    "Port Operations",
    "Ownership",
    "Compliance",
    "Alerts",
  ];
  return (allowed.find((d) => d === raw) ?? "Alerts") as SignalDomain;
}

/** DB row → UI Signal. Repository is the only place this mapping lives. */
export function rowToSignal(r: SignalRow, now = Date.now()): Signal {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const title = (meta.title as string) ?? r.statement.split(" · ")[0] ?? r.statement;
  const detail = (meta.detail as string) ?? r.statement;
  const status = ((meta.status as string) === "ACK" ? "ACK" : "NEW") as SignalStatus;
  return {
    id: r.id,
    title,
    detail,
    domain: domainOf(r.domain),
    risk: severityToRisk(r.severity),
    confidence: toChipTier(r.confidence),
    detectedAt: r.observed_at,
    detectedLabel: relativeLabel(r.observed_at, now),
    status,
    entityId: (meta.entityId as string) ?? r.entity_id ?? undefined,
    investigationId: (meta.investigationId as string) ?? undefined,
    vessel: (meta.vessel as string) ?? undefined,
    imo: (meta.imo as string) ?? undefined,
    type: (meta.type as SignalType) ?? undefined,
  };
}

export class SupabaseSignalRepository implements Repository<SignalRow> {
  async list(opts: SignalListFilters = {}): Promise<ListResult<SignalRow>> {
    const env = await listSignals({
      data: {
        limit: opts.limit ?? 200,
        domain: opts.domain && opts.domain !== "All" ? opts.domain : undefined,
        from: opts.from,
        to: opts.to,
      },
    });
    const rows = unwrap<SignalRow[]>(env, []);
    return { rows, total: rows.length };
  }
  async getById(_id: Id): Promise<SignalRow | null> {
    return null;
  }
  async listSignals(opts: SignalListFilters = {}): Promise<Signal[]> {
    const { rows } = await this.list(opts);
    const now = Date.now();
    return rows.map((r) => rowToSignal(r, now));
  }
}

export const signalRepository = new SupabaseSignalRepository();
