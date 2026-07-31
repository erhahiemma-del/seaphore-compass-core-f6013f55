/**
 * INT-01B — Entity Profile Page
 *
 * Full 360° view of a single intelligence entity. Five tabs:
 *   Summary, Timeline, Relationships, Evidence, Provenance (IPEF)
 *
 * All data from live MicContainer via server functions.
 * Graph uses the existing GraphView component (no duplication).
 * Provenance uses the existing ProvenancePanel (no duplication).
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { GraphView } from "@/components/mkg/GraphView";
import { ProvenancePanel } from "@/components/ipef/ProvenancePanel";
import {
  getEntityFn,
  getEntityRelationshipsFn,
  getEntityTimelineFn,
} from "@/lib/entity/entity.functions";
import { getMioIpefProvenanceFn } from "@/lib/ipef/ipef.functions";
import type { IpefRecord } from "@/services/ipef/types";

type Tab = "summary" | "timeline" | "relationships" | "evidence" | "provenance";
type EntityData   = Awaited<ReturnType<typeof getEntityFn>>;
type GraphData    = Awaited<ReturnType<typeof getEntityRelationshipsFn>>;
type TimelineData = Awaited<ReturnType<typeof getEntityTimelineFn>>;

// ── Shared atoms ──────────────────────────────────────────────────────

const BAND_COLOR: Record<string, string> = {
  critical: "text-red-700 bg-red-50 border-red-300",
  high:     "text-orange-700 bg-orange-50 border-orange-300",
  elevated: "text-amber-700 bg-amber-50 border-amber-300",
  low:      "text-emerald-700 bg-emerald-50 border-emerald-300",
};

const GRADE_COLOR: Record<string, string> = {
  VERIFIED:     "text-emerald-700 bg-emerald-50 border-emerald-300",
  CORROBORATED: "text-teal-700   bg-teal-50   border-teal-300",
  OBSERVED:     "text-sky-700    bg-sky-50    border-sky-300",
  REPORTED:     "text-amber-700  bg-amber-50  border-amber-300",
  INFERRED:     "text-slate-700  bg-slate-50  border-slate-300",
  UNKNOWN:      "text-slate-500  bg-slate-50  border-slate-200",
};

const SIG_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500",
  medium: "bg-amber-400", low: "bg-slate-300",
};

function Chip({ label, variant = "default" }: { label: string; variant?: string }) {
  const cls = BAND_COLOR[label.toLowerCase()]
    ?? GRADE_COLOR[label.toUpperCase()]
    ?? "text-slate-600 bg-slate-50 border-slate-300";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
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

// ── Summary tab ───────────────────────────────────────────────────────

function SummaryTab({ data }: { data: EntityData & { found: true } }) {
  const { entity, risk } = data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Identity */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Identity</h3>
        <dl>
          <KV k="Canonical ID" v={<span className="font-mono text-[11px]">{entity.canonicalId}</span>} />
          <KV k="Kind"        v={<Chip label={String(entity.kind)} />} />
          <KV k="Grade"       v={<Chip label={String(entity.grade)} />} />
          <KV k="Confidence"  v={<Chip label={String(entity.confidence)} />} />
          <KV k="Score"       v={`${(entity.confidenceScore * 100).toFixed(0)}%`} />
          <KV k="First seen"  v={entity.firstSeenAt?.slice(0, 10) ?? "—"} />
          <KV k="Last seen"   v={entity.lastSeenAt?.slice(0, 10) ?? "—"} />
          <KV k="Revision"    v={entity.revision} />
        </dl>
      </div>

      {/* Aliases */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Aliases & alternate IDs
        </h3>
        {entity.aliases.length === 0 ? (
          <p className="text-xs text-muted-foreground">No aliases registered</p>
        ) : (
          <ul className="space-y-1">
            {entity.aliases.map((alias) => (
              <li key={alias}>
                <Link to="/entity/$id" params={{ id: alias }} className="font-mono text-[11px] text-teal-600 hover:underline">
                  {alias}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Attributes */}
      {Object.keys(entity.attributes).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Attributes</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8">
            {Object.entries(entity.attributes)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (
                <KV key={k} k={k} v={<span className="font-mono text-[11px]">{String(v)}</span>} />
              ))}
          </dl>
        </div>
      )}

      {/* Risk */}
      <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Risk Summary</h3>
        {!risk ? (
          <p className="text-xs text-muted-foreground">No risk profile computed yet</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <Chip label={risk.band} />
              <span className="text-2xl font-bold text-foreground">{risk.score.toFixed(0)}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              <Chip label={risk.confidence} />
            </div>
            <p className="text-xs text-muted-foreground mb-3">{risk.narrative}</p>
            {risk.indicators.length > 0 && (
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

      {/* Confidence decomposition */}
      {entity.confidenceComponents.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Confidence decomposition
          </h3>
          <dl className="space-y-1.5">
            {entity.confidenceComponents.map((c) => (
              <div key={c.factor} className="flex items-center justify-between text-xs">
                <dt className="text-muted-foreground">{c.factor}</dt>
                <dd className="font-mono text-foreground">{(c.contribution * 100).toFixed(0)}% — {c.explanation}</dd>
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
        {timelineData.total} event{timelineData.total !== 1 ? "s" : ""} ·
        {timelineData.firstEvent && <> from {timelineData.firstEvent.slice(0, 10)}</>}
        {timelineData.lastEvent  && <> to {timelineData.lastEvent.slice(0, 10)}</>}
      </p>
      {timelineData.events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No timeline events recorded yet</p>
      ) : (
        <div className="space-y-0">
          {timelineData.events.map((ev, i) => (
            <div key={ev.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-1.5 shrink-0">
                <div className={`h-2.5 w-2.5 rounded-full border-2 border-white ${SIG_DOT[ev.significance] ?? "bg-slate-300"}`} />
                {i < timelineData.events.length - 1 && <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 24 }} />}
              </div>
              <div className="flex-1 pb-4 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{ev.label}</span>
                  <Chip label={ev.grade} />
                  <span className="text-[10px] text-muted-foreground ml-auto">{ev.occurredAt.slice(0, 10)}</span>
                </div>
                {ev.description && ev.description !== ev.label && (
                  <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
                )}
                {ev.relatedEntityIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ev.relatedEntityIds.map((rid) => (
                      <Link key={rid} to="/entity/$id" params={{ id: rid }}
                        className="text-[10px] text-teal-600 hover:underline font-mono">{rid}</Link>
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
        {graphData.nodes.length} node{graphData.nodes.length !== 1 ? "s" : ""} ·
        {graphData.edges.length} edge{graphData.edges.length !== 1 ? "s" : ""} ·
        up to {graphData.depth} hops from this entity
      </p>

      {/* Graph */}
      <div className="rounded-lg border border-border bg-card overflow-hidden" style={{ height: 380 }}>
        <GraphView
          nodes={graphData.nodes as any}
          edges={graphData.edges as any}
          focusNodeId={entityId}
          selectedNodeId={selected}
          onSelectNode={setSelected}
        />
      </div>

      {/* Edge list */}
      {graphData.edges.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relationships</span>
          </div>
          <div className="divide-y divide-border">
            {graphData.edges.map((edge) => (
              <div key={edge.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Link to="/entity/$id" params={{ id: edge.fromId }}
                    className="text-xs font-mono text-teal-600 hover:underline truncate">{edge.fromId}</Link>
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                    → {edge.type} →
                  </span>
                  <Link to="/entity/$id" params={{ id: edge.toId }}
                    className="text-xs font-mono text-teal-600 hover:underline truncate">{edge.toId}</Link>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Chip label={edge.grade} />
                  <span className="text-[10px] text-muted-foreground">{(edge.weight * 100).toFixed(0)}%</span>
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

function EvidenceTab({ data }: { data: EntityData & { found: true } }) {
  const { evidenceSummary } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total evidence</div>
          <div className="text-2xl font-semibold mt-1">{evidenceSummary.total}</div>
        </div>
        {Object.entries(evidenceSummary.byGrade).map(([grade, count]) => (
          <div key={grade} className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{grade}</div>
            <div className="text-2xl font-semibold mt-1">{count}</div>
          </div>
        ))}
      </div>

      {evidenceSummary.records.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No evidence records yet</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="min-w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Source", "Grade", "Kind", "Observed"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {evidenceSummary.records.map((ev) => (
                <tr key={ev.evidenceId} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{ev.sourceName}</td>
                  <td className="px-3 py-2"><Chip label={ev.grade} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{ev.kind}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{ev.observedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function EntityProfile() {
  const { id } = useParams({ from: "/entity/$id" });
  const [tab, setTab] = useState<Tab>("summary");
  const [entityData,   setEntityData]   = useState<EntityData | null>(null);
  const [graphData,    setGraphData]    = useState<GraphData | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [ipefRecord,   setIpefRecord]   = useState<IpefRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchEntity   = useServerFn(getEntityFn);
  const fetchGraph    = useServerFn(getEntityRelationshipsFn);
  const fetchTimeline = useServerFn(getEntityTimelineFn);
  const fetchIpef     = useServerFn(getMioIpefProvenanceFn);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
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

  useEffect(() => { load(); }, [load]);

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "summary",       label: "Summary" },
    { id: "timeline",      label: "Timeline",      count: timelineData?.total },
    { id: "relationships", label: "Relationships",  count: graphData?.edges.length },
    { id: "evidence",      label: "Evidence",       count: entityData && entityData.found ? (entityData as any).evidenceSummary?.total : undefined },
    { id: "provenance",    label: "Provenance (Why?)" },
  ];

  const label = entityData?.found ? (entityData as any).entity?.label ?? id : id;

  return (
    <AppShell title="Entity Profile" subtitle={label} mode="light">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{label}</h1>
            <p className="text-xs text-muted-foreground font-mono">{id}</p>
          </div>
          {entityData?.found && (entityData as any).entity?.confidence && (
            <Chip label={(entityData as any).entity.confidence} />
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium transition-colors relative ${
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
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <div className="py-16 text-center text-sm text-muted-foreground">Loading entity…</div>}
        {error   && <div className="py-8 text-center text-sm text-red-600">{error}</div>}

        {!loading && !error && entityData && !entityData.found && (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-foreground">Entity not found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {id} has not been processed by the MIC yet. Send a Copilot query about this entity to populate it.
            </p>
          </div>
        )}

        {!loading && !error && entityData?.found && (
          <>
            {tab === "summary"       && <SummaryTab data={entityData as any} />}
            {tab === "timeline"      && timelineData && <TimelineTab timelineData={timelineData} />}
            {tab === "relationships" && graphData    && <RelationshipsTab graphData={graphData} entityId={id} />}
            {tab === "evidence"      && <EvidenceTab data={entityData as any} />}
            {tab === "provenance" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Intelligence provenance — pipeline trace, contributors, confidence decomposition.
                  Shows the most recent IPEF execution record. Reuses the existing ProvenancePanel.
                </p>
                {ipefRecord
                  ? <ProvenancePanel ipef={ipefRecord} />
                  : <p className="text-sm text-muted-foreground py-8 text-center">
                      No provenance record yet. Send a Copilot query to populate the IPEF.
                    </p>
                }
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
