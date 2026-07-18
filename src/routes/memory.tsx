import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Ship, Sparkles, Star, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { AuditTimeline } from "@/components/intelligence/AuditTimeline";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { KnowledgeGraph } from "@/components/intelligence/KnowledgeGraph";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { cn } from "@/lib/utils";
import {
  AUDIT_TRAIL,
  ENTITY_SUBTABS,
  GRAPH_EDGES,
  GRAPH_NODES,
  MEMORY_ENTITY,
  MEMORY_INSIGHTS,
  MEMORY_TABS,
  SIMILAR_ENTITIES,
  type EntitySubtab,
  type MemoryTabKey,
} from "@/lib/lifecycle-data";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Institutional Memory · Seaphore" },
      { name: "description", content: "Every closed investigation becomes a searchable precedent." },
    ],
  }),
  component: MemoryPage,
});

function MemoryPage() {
  const [tab, setTab] = useState<MemoryTabKey>("profiles");
  const [sub, setSub] = useState<EntitySubtab>("Overview");
  const e = MEMORY_ENTITY;

  return (
    <AppShell title="Institutional Memory" subtitle="Knowledge & Learning" mode="light">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        {/* MEM-1 top tabs */}
        <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-card px-2 py-1.5 shadow-card">
          {MEMORY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as MemoryTabKey)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold motion-fast",
                tab === t.key
                  ? "bg-[color:var(--color-navy)] text-white"
                  : "text-foreground/75 hover:bg-surface-2",
              )}
            >
              {t.label}
              {"isNew" in t && t.isNew && (
                <span
                  className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: "#7C3AED", backgroundColor: "#7C3AED14" }}
                >
                  NEW
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* MEM-2 entity header */}
        <PanelCard>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]">
              <Ship className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="type-label text-slate">Entity</div>
              <h1 className="type-display text-foreground">{e.name}</h1>
              <div className="type-small text-slate">
                IMO {e.imo} · {e.kind} · {e.flag} · {e.id}
              </div>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-3 text-right sm:grid-cols-5">
              <Kpi label="Risk Score" value={`${e.riskScore}`} chip={<ConfidenceChip tier={e.confidence} size={9} />} />
              <Kpi label="Total Vessels" value={String(e.totalVessels)} />
              <Kpi label="Total Voyages" value={String(e.totalVoyages)} />
              <Kpi label="Revenue at Risk" value={e.revenueAtRisk} />
              <Kpi label="Risk Level" value="" custom={<RiskPill level={e.riskLevel} />} />
            </div>
          </div>

          {/* MEM-2 sub-tabs */}
          <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3">
            {ENTITY_SUBTABS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSub(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold motion-fast",
                  sub === s
                    ? "bg-[color:var(--color-teal)] text-white"
                    : "text-slate hover:bg-surface-2",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </PanelCard>

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* MEM-4 entity snapshot */}
          <aside className="space-y-3">
            <PanelCard>
              <PanelHead title="Entity Snapshot" />
              <dl className="space-y-1.5 text-[12px]">
                <SnapRow label="Investigated" value={`${e.investigatedCount} times`} />
                <SnapRow label="Open" value={String(e.openInvestigations)} />
                <SnapRow label="Closed" value={String(e.closedInvestigations)} />
                <SnapRow label="Risk Level" value="" custom={<RiskPill level={e.riskLevel} />} />
                <SnapRow label="Trend" value="" custom={
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                    e.trend === "rising" ? "text-[color:var(--color-red)]" : "text-[color:var(--color-green)]"
                  }`}>
                    <TrendingUp className="h-3 w-3" />
                    {e.trend}
                  </span>
                } />
                <SnapRow label="First Seen" value={e.firstSeen} />
                <SnapRow label="Last Seen" value={e.lastSeen} />
                <SnapRow label="Known Since" value={e.knownSince} />
                <SnapRow label="Watchlist" value={e.watchlist ? "Yes" : "No"} />
              </dl>
              <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
                View Full Entity Profile <ArrowRight className="h-3 w-3" />
              </button>
            </PanelCard>
          </aside>

          {/* MEM-3 knowledge graph */}
          <PanelCard variant="edge">
            <KnowledgeGraph
              nodes={GRAPH_NODES}
              edges={GRAPH_EDGES}
              height={560}
              minimap
            />
          </PanelCard>

          {/* MEM-5 copilot / insights / similar / learn */}
          <aside className="space-y-3">
            <PanelCard>
              <header className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-purple)]/10 text-[color:var(--color-purple)]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="type-h2 text-foreground">Seaphore Copilot</span>
              </header>
              <div className="type-label mb-1 text-slate">Key Insights</div>
              <ul className="space-y-1.5 text-[12px]">
                {MEMORY_INSIGHTS.map((i) => (
                  <li key={i.observation} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-teal)]" />
                    <span className="flex-1">{i.observation}</span>
                    <ConfidenceChip tier={i.confidence} size={9} />
                  </li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard>
              <div className="type-label mb-1 text-slate">Recommended Actions</div>
              <ul className="space-y-1.5 text-[12px]">
                <RecItem risk="MEDIUM" title="Review sanctions match every 30 days" />
                <RecItem risk="LOW" title="Refresh ownership graph on any new filing" />
                <RecItem risk="MEDIUM" title="Compare peer duty base quarterly" />
              </ul>
            </PanelCard>

            <PanelCard>
              <div className="type-label mb-1 text-slate">Similar Entities</div>
              <ul className="space-y-1.5 text-[12px]">
                {SIMILAR_ENTITIES.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="type-mono text-[11px] text-slate">{s.id}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ color: "#0E7C7B", backgroundColor: "#0E7C7B14" }}
                    >
                      {s.matchPct}%
                    </span>
                  </li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard>
              <div className="type-label mb-1 text-slate">Learn &amp; Insights</div>
              <ul className="space-y-1 text-[12px]">
                {[
                  "Lessons Learned",
                  "Pattern Library",
                  "Repeat Entities",
                  "Officer Notes Library",
                ].map((l) => (
                  <li key={l}>
                    <button className="flex w-full items-center justify-between rounded px-2 py-1.5 motion-fast hover:bg-surface-2">
                      <span className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-[color:var(--color-gold)]" />
                        {l}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate" />
                    </button>
                  </li>
                ))}
              </ul>
            </PanelCard>
          </aside>
        </div>

        {/* MEM-6 audit trail */}
        <AuditTimeline events={AUDIT_TRAIL} />
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  chip,
  custom,
}: {
  label: string;
  value: string;
  chip?: React.ReactNode;
  custom?: React.ReactNode;
}) {
  return (
    <div>
      <div className="type-label text-slate">{label}</div>
      {custom ?? (
        <div className="text-[18px] font-extrabold text-foreground">{value}</div>
      )}
      {chip && <div className="mt-0.5">{chip}</div>}
    </div>
  );
}

function SnapRow({
  label,
  value,
  custom,
}: {
  label: string;
  value: string;
  custom?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-1 last:border-0">
      <span className="type-label text-slate">{label}</span>
      {custom ?? <span className="text-[12px] font-semibold text-foreground">{value}</span>}
    </div>
  );
}

function RecItem({ risk, title }: { risk: "HIGH" | "MEDIUM" | "LOW"; title: string }) {
  return (
    <li className="flex items-center gap-2 rounded-md bg-surface-2/60 px-2.5 py-1.5">
      <RiskPill level={risk} />
      <span className="min-w-0 flex-1 text-foreground/85">{title}</span>
      <ArrowRight className="h-3 w-3 text-slate" />
    </li>
  );
}
