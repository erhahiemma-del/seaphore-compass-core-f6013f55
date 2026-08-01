/**
 * OPS-03 — Entity Profile
 *
 * Data layer: MIC server functions (MicContainer, requireSupabaseAuth).
 * This is the SOLE intelligence engine — the EIE runtime, registry,
 * and resolution engine are NOT used here.
 *
 * Tabs:
 *   Summary      — identity, aliases, attributes, risk, confidence decomposition
 *   Timeline     — chronological events with significance dots
 *   Relationships — MKG graph (GraphView) + edge list
 *   Evidence     — evidence records by connector/grade/kind
 *   Provenance   — IPEF ProvenancePanel (Why? explainability)
 *   Graph        — STUB: Knowledge-graph expand/collapse (INT-01H)
 *   Copilot      — STUB: Entity Q&A quick-fire buttons (INT-01I)
 *
 * UI patterns harvested from EIE (ARCH-01 §5):
 *   • EmptyNote component: 3-sentence stated absence
 *   • COPILOT_QUESTIONS quick-fire button array (stub — no EIE data layer)
 *   • Knowledge Graph tab shell (stub — no EIE data layer)
 *   • Risk driver rendering
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { GraphView } from "@/components/mkg/GraphView";
import type { MkgEdge, MkgNode } from "@/services/mkg/types";
import { ProvenancePanel } from "@/components/ipef/ProvenancePanel";
import {
  getEntityFn,
  getEntityRelationshipsFn,
  getEntityTimelineFn,
} from "@/lib/entity/entity.functions";
import { getMioIpefProvenanceFn } from "@/lib/ipef/ipef.functions";
import type { IpefRecord } from "@/services/ipef/types";

// ── Types ─────────────────────────────────────────────────────────────

type Tab =
  | "summary"
  | "timeline"
  | "relationships"
  | "evidence"
  | "provenance"
  | "graph"
  | "copilot";
type EntityData = Awaited<ReturnType<typeof getEntityFn>>;
type EntityFound = Extract<EntityData, { found: true }>;
type GraphData = Awaited<ReturnType<typeof getEntityRelationshipsFn>>;
type TimelineData = Awaited<ReturnType<typeof getEntityTimelineFn>>;

// ── EIE UI pattern: Copilot quick-fire questions (harvested, stub wiring) ──
const COPILOT_QUESTIONS = [
  "Show vessel profile",
  "Show owner",
  "Show related companies",
  "Show connected containers",
  "Show manifest history",
  "Show investigation history",
];

// ── Shared atoms ──────────────────────────────────────────────────────

const BAND_COLOR: Record<string, string> = {
  critical: "text-red-700 bg-red-50 border-red-300",
  high: "text-orange-700 bg-orange-50 border-orange-300",
  elevated: "text-amber-700 bg-amber-50 border-amber-300",
  low: "text-emerald-700 bg-emerald-50 border-emerald-300",
};
const GRADE_COLOR: Record<string, string> = {
  VERIFIED: "text-emerald-700 bg-emerald-50 border-emerald-300",
  CORROBORATED: "text-teal-700 bg-teal-50 border-teal-300",
  OBSERVED: "text-sky-700 bg-sky-50 border-sky-300",
  REPORTED: "text-amber-700 bg-amber-50 border-amber-300",
  INFERRED: "text-slate-700 bg-slate-50 border-slate-300",
  UNKNOWN: "text-slate-500 bg-slate-50 border-slate-200",
};
const SIG_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-slate-300",
};

function Chip({ label }: { label: string }) {
  const cls =
    BAND_COLOR[label?.toLowerCase()] ??
    GRADE_COLOR[label?.toUpperCase()] ??
    "text-slate-600 bg-slate-50 border-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <dt className="text-xs text-muted-foreground shrink-0 w-36">{k}</dt>
      <dd className="text-xs text-foreground text-right">{v}</dd>
    </div>
  );
}

/**
 * EIE UI pattern harvested per ARCH-01 §5.
 * Explains WHY data is absent rather than showing a generic spinner.
 */
function EmptyNote({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium text-foreground">{text}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Summary tab ───────────────────────────────────────────────────────

function SummaryTab({ data }: { data: EntityFound }) {
  const { entity, risk } = data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Identity
        </h3>
        <dl>
          <KV
            k="Canonical ID"
            v={<span className="font-mono text-[11px]">{entity.canonicalId}</span>}
          />
          <KV k="Kind" v={<Chip label={String(entity.kind)} />} />
          <KV k="Grade" v={<Chip label={String(entity.grade)} />} />
          <KV k="Confidence" v={<Chip label={String(entity.confidence)} />} />
          <KV k="Score" v={`${((entity.confidenceScore ?? 0) * 100).toFixed(0)}%`} />
          <KV k="First seen" v={entity.firstSeenAt?.slice(0, 10) ?? "—"} />
          <KV k="Last seen" v={entity.lastSeenAt?.slice(0, 10) ?? "—"} />
          <KV k="Revision" v={entity.revision} />
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Aliases & alternate IDs
        </h3>
        {(entity.aliases ?? []).length === 0 ? (
          <EmptyNote
            text="No aliases registered"
            hint="Aliases are populated when the resolution engine merges duplicate entity records."
          />
        ) : (
          <ul className="space-y-1">
            {(entity.aliases as string[]).map((alias) => (
              <li key={alias}>
                <Link
                  to="/entity/$id"
                  params={{ id: alias }}
                  className="font-mono text-[11px] text-teal-600 hover:underline"
                >
                  {alias}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {Object.keys(entity.attributes ?? {}).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Attributes
          </h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8">
            {Object.entries(entity.attributes as Record<string, unknown>)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (
                <KV key={k} k={k} v={<span className="font-mono text-[11px]">{String(v)}</span>} />
              ))}
          </dl>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Risk Summary
        </h3>
        {!risk ? (
          <EmptyNote
            text="No risk profile computed yet"
            hint="Send a Copilot query about this entity to trigger the MIC risk engine."
          />
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <Chip label={risk.band} />
              <span className="text-2xl font-bold text-foreground">{risk.score?.toFixed(0)}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              <Chip label={risk.confidence} />
            </div>
            <p className="text-xs text-muted-foreground mb-3">{risk.narrative}</p>
            {/* EIE UI pattern: risk driver list (ARCH-01 §5) */}
            {(risk.indicators ?? []).length > 0 && (
              <div className="space-y-1">
                {risk.indicators.map((ind) => (
                  <div key={ind.kind} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{ind.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{ind.rationale}</span>
                      <span className="font-semibold text-foreground">{ind.points}pt</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {(entity.confidenceComponents ?? []).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Confidence decomposition
          </h3>
          <dl className="space-y-1.5">
            {entity.confidenceComponents.map((c) => (
              <div key={c.factor} className="flex items-center justify-between text-xs">
                <dt className="text-muted-foreground">{c.factor}</dt>
                <dd className="font-mono text-foreground">
                  {(c.contribution * 100).toFixed(0)}% — {c.explanation}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// ── Timeline tab ──────────────────────────────────────────────────────

function TimelineTab({ timelineData }: { timelineData: TimelineData }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        {timelineData.total} event{timelineData.total !== 1 ? "s" : ""}
        {timelineData.firstEvent && <> · from {timelineData.firstEvent.slice(0, 10)}</>}
        {timelineData.lastEvent && <> to {timelineData.lastEvent.slice(0, 10)}</>}
      </p>
      {timelineData.events.length === 0 ? (
        /* EIE UI pattern: stated absence (ARCH-01 §5) */
        <EmptyNote
          text="No dated evidence — no timeline can be reconstructed."
          hint="Send a Copilot query to populate evidence for this entity."
        />
      ) : (
        <div className="space-y-0">
          {timelineData.events.map((ev, i) => (
            <div key={ev.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-1.5 shrink-0">
                <div
                  className={`h-2.5 w-2.5 rounded-full border-2 border-white ${SIG_DOT[ev.significance] ?? "bg-slate-300"}`}
                />
                {i < timelineData.events.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 24 }} />
                )}
              </div>
              <div className="flex-1 pb-4 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{ev.label}</span>
                  <Chip label={ev.grade} />
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {ev.occurredAt.slice(0, 10)}
                  </span>
                </div>
                {ev.description && ev.description !== ev.label && (
                  <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
                )}
                {(ev.relatedEntityIds ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ev.relatedEntityIds.map((rid: string) => (
                      <Link
                        key={rid}
                        to="/entity/$id"
                        params={{ id: rid }}
                        className="text-[10px] text-teal-600 hover:underline font-mono"
                      >
                        {rid}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Relationships tab ─────────────────────────────────────────────────

function RelationshipsTab({ graphData, entityId }: { graphData: GraphData; entityId: string }) {
  const [selected, setSelected] = useState(entityId);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {graphData.nodes.length} node{graphData.nodes.length !== 1 ? "s" : ""} ·{" "}
        {graphData.edges.length} edge{graphData.edges.length !== 1 ? "s" : ""} · up to{" "}
        {graphData.depth} hops
      </p>
      <div
        className="rounded-lg border border-border bg-card overflow-hidden"
        style={{ height: 380 }}
      >
        <GraphView
          nodes={graphData.nodes as unknown as MkgNode[]}
          edges={graphData.edges as unknown as MkgEdge[]}
          focusNodeId={entityId}
          selectedNodeId={selected}
          onSelectNode={setSelected}
        />
      </div>
      {graphData.edges.length === 0 ? (
        <EmptyNote
          text="No record names a counterparty for this entity."
          hint="Relationships are derived from evidence fields. Run a Copilot query to populate."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Relationships
            </span>
          </div>
          <div className="divide-y divide-border">
            {graphData.edges.map((edge) => (
              <div key={edge.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    to="/entity/$id"
                    params={{ id: edge.fromId }}
                    className="text-xs font-mono text-teal-600 hover:underline truncate"
                  >
                    {edge.fromId}
                  </Link>
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                    → {edge.type} →
                  </span>
                  <Link
                    to="/entity/$id"
                    params={{ id: edge.toId }}
                    className="text-xs font-mono text-teal-600 hover:underline truncate"
                  >
                    {edge.toId}
                  </Link>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Chip label={edge.grade} />
                  <span className="text-[10px] text-muted-foreground">
                    {(edge.weight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Evidence tab ──────────────────────────────────────────────────────

function EvidenceTab({ data }: { data: EntityFound }) {
  const evidenceSummary = data.evidenceSummary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Total evidence
          </div>
          <div className="text-2xl font-semibold mt-1">{evidenceSummary?.total ?? 0}</div>
        </div>
        {Object.entries((evidenceSummary?.byGrade ?? {}) as Record<string, number>).map(
          ([grade, count]) => (
            <div key={grade} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {grade}
              </div>
              <div className="text-2xl font-semibold mt-1">{count}</div>
            </div>
          ),
        )}
      </div>
      {(evidenceSummary?.records ?? []).length === 0 ? (
        <EmptyNote
          text="No evidence records yet."
          hint="Send a Copilot query about this entity to populate evidence."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="min-w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Source", "Grade", "Kind", "Observed"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {evidenceSummary.records.map((ev) => (
                <tr key={ev.evidenceId} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{ev.sourceName}</td>
                  <td className="px-3 py-2">
                    <Chip label={ev.grade} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{ev.kind}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {ev.observedAt?.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Graph tab — STUB (INT-01H) ────────────────────────────────────────
// EIE UI pattern harvested: expand/collapse shell (ARCH-01 §5).
// Data layer: will use MIC graph projection from src/services/mic/graph/
// when INT-01H is complete. No EIE runtime is imported.

function GraphTabStub({ entityId }: { entityId: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-medium text-amber-800">
          INT-01H — Knowledge Graph Expand/Collapse
        </p>
        <p className="text-xs text-amber-700 mt-1">
          This tab will provide interactive expand/collapse graph exploration with hidden-neighbour
          counts, search, and type filtering. Data source: MIC graph projection
          (src/services/mic/graph/). Implementation in Sprint INT-01H.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Use the Relationships tab for the current static graph view while INT-01H is pending.
      </p>
      <Link
        to="/knowledge-graph"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
      >
        Open full Knowledge Graph →
      </Link>
    </div>
  );
}

// ── Copilot tab — STUB (INT-01I) ─────────────────────────────────────
// EIE UI pattern harvested: COPILOT_QUESTIONS quick-fire buttons (ARCH-01 §5).
// Data layer: will use MIC Copilot facade from src/services/mic/copilot/
// when INT-01I is complete. No EIE runtime is imported.

function CopilotTabStub({ entityId, entityLabel }: { entityId: string; entityLabel: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-medium text-amber-800">INT-01I — Entity Copilot Q&A</p>
        <p className="text-xs text-amber-700 mt-1">
          These buttons will dispatch entity-scoped Copilot queries through the MIC Copilot facade
          (src/services/mic/copilot/) when INT-01I is complete. The intent classification, answer
          generation, and stated-gap reporting from the EIE copilot.ts will be ported to consume
          MicContainer registries.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {COPILOT_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => setSelected(q)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              selected === q
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium text-foreground mb-1">
            "{selected} — {entityLabel}"
          </p>
          <p className="text-xs text-muted-foreground">
            This question will be answered by the MIC Copilot facade in INT-01I. No evidence answers
            this question for this entity yet — this is a stated gap, not an empty result.
          </p>
          <p className="text-xs text-muted-foreground mt-2 font-mono">Entity: {entityId}</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function EntityProfile() {
  const { id } = useParams({ from: "/entity/$id" });
  const [tab, setTab] = useState<Tab>("summary");
  const [entityData, setEntityData] = useState<EntityData | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [ipefRecord, setIpefRecord] = useState<IpefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntity = useServerFn(getEntityFn);
  const fetchGraph = useServerFn(getEntityRelationshipsFn);
  const fetchTimeline = useServerFn(getEntityTimelineFn);
  const fetchIpef = useServerFn(getMioIpefProvenanceFn);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ed, gd, td, ipef] = await Promise.all([
        fetchEntity({ data: { id } }),
        fetchGraph({ data: { id, depth: 2 } }),
        fetchTimeline({ data: { id } }),
        fetchIpef({}).catch(() => null),
      ]);
      setEntityData(ed);
      setGraphData(gd);
      setTimelineData(td);
      if (ipef?.record) setIpefRecord(ipef.record as unknown as IpefRecord);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entity");
    } finally {
      setLoading(false);
    }
  }, [id, fetchEntity, fetchGraph, fetchTimeline, fetchIpef]);

  useEffect(() => {
    load();
  }, [load]);

  const entityFound = entityData?.found;
  const entityLabel = entityData && entityData.found ? (entityData.entity?.label ?? id) : id;

  const TABS: Array<{ id: Tab; label: string; count?: number; stub?: boolean }> = [
    { id: "summary", label: "Summary" },
    { id: "timeline", label: "Timeline", count: timelineData?.total },
    { id: "relationships", label: "Relationships", count: graphData?.edges.length },
    {
      id: "evidence",
      label: "Evidence",
      count: entityData && entityData.found ? entityData.evidenceSummary?.total : undefined,
    },
    { id: "provenance", label: "Provenance" },
    { id: "graph", label: "Knowledge Graph", stub: true },
    { id: "copilot", label: "Copilot", stub: true },
  ];

  return (
    <AppShell title="Entity Profile" subtitle={entityLabel} mode="light">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{entityLabel}</h1>
            <p className="text-xs text-muted-foreground font-mono">{id}</p>
          </div>
          {entityData?.found && entityData.entity?.confidence && (
            <Chip label={entityData.entity.confidence} />
          )}
        </div>

        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
                tab === t.id
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                  {t.count}
                </span>
              )}
              {t.stub && <span className="ml-1 text-[9px] text-amber-600 font-bold">STUB</span>}
            </button>
          ))}
        </div>

        {loading && (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading entity…</div>
        )}
        {error && <div className="py-8 text-center text-sm text-red-600">{error}</div>}

        {!loading && !error && entityData && !entityData.found && (
          <div className="py-16 text-center">
            <EmptyNote
              text={`Entity not found: ${id}`}
              hint="This entity has not been processed by the MIC yet. Send a Copilot query about this entity to populate the Intelligence Object registry."
            />
          </div>
        )}

        {!loading && !error && entityData?.found && (
          <>
            {tab === "summary" && <SummaryTab data={entityData} />}
            {tab === "timeline" && timelineData && <TimelineTab timelineData={timelineData} />}
            {tab === "relationships" && graphData && (
              <RelationshipsTab graphData={graphData} entityId={id} />
            )}
            {tab === "evidence" && <EvidenceTab data={entityData} />}
            {tab === "provenance" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Intelligence provenance — pipeline trace, contributors, confidence decomposition,
                  lineage. Powered by IPEF (INT-01A.3).
                </p>
                {ipefRecord ? (
                  <ProvenancePanel ipef={ipefRecord} />
                ) : (
                  <EmptyNote
                    text="No provenance record yet."
                    hint="Send a Copilot query to populate the IPEF provenance record."
                  />
                )}
              </div>
            )}
            {tab === "graph" && <GraphTabStub entityId={id} />}
            {tab === "copilot" && <CopilotTabStub entityId={id} entityLabel={entityLabel} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
