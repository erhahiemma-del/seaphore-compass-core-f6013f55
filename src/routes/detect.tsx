import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  Gauge,
  Radar,
  Sparkles,
  ThumbsUp,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ConfidenceLegend } from "@/components/confidence-legend";
import { CopilotCards } from "@/components/copilot-cards";
import { DomainDonutChart } from "@/components/domain-donut-chart";
import { DomainFilterTabs } from "@/components/domain-filter-tabs";
import { KpiTile } from "@/components/kpi-tile";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskHeatmap } from "@/components/risk-heatmap";
import { RiskPill } from "@/components/risk-pill";
import { SignalList } from "@/components/signal-list";
import { SignalTimelineChart, type TimelineRange } from "@/components/signal-timeline-chart";
import { TypeTiles } from "@/components/type-tiles";
import { useHandoffNavigate } from "@/lib/nav-context";
import {
  AI_SIGNAL_SUMMARY,
  RISK_HEATMAP,
  SIGNALS,
  SIGNALS_BY_DOMAIN,
  SIGNAL_DOMAINS,
  SIGNAL_RIBBON,
  SIGNAL_TIMELINE_24H,
  SIGNAL_TIMELINE_6H,
  SIGNAL_TIMELINE_7D,
  SIGNAL_TYPE_TILES,
  signalCountsByDomain,
  type Signal,
  type SignalDomain,
} from "@/lib/lifecycle-data";
import { ConfidenceChip } from "@/components/confidence-chip";

export const Route = createFileRoute("/detect")({
  head: () => ({
    meta: [
      { title: "Detect · Intelligence Feed · Seaphore" },
      { name: "description", content: "Continuous signal surface across every Intelligence Centre." },
    ],
  }),
  component: DetectPage,
});

function DetectPage() {
  const counts = signalCountsByDomain();
  const [activeDomain, setActiveDomain] = useState<"All" | SignalDomain>("All");
  const [range, setRange] = useState<TimelineRange>("24H");
  const handoff = useHandoffNavigate();

  const filtered = useMemo(
    () =>
      activeDomain === "All"
        ? SIGNALS
        : SIGNALS.filter((s) => s.domain === activeDomain),
    [activeDomain],
  );

  const topHigh = useMemo(
    () => filtered.filter((s) => s.risk === "HIGH").slice(0, 5),
    [filtered],
  );

  const openSignal = (s: Signal) =>
    handoff({
      target: `/investigate/${s.investigationId ?? "INV-2026-00431"}`,
      context: {
        signalId: s.id,
        entityId: s.entityId,
        confidence: s.confidence.toUpperCase() as
          | "VERIFIED"
          | "OBSERVED"
          | "INFERRED"
          | "UNCONFIRMED",
        fromStage: "Detect",
        fromRoute: "/detect",
      },
    });

  return (
    <AppShell title="Detect" subtitle="Intelligence Feed" mode="light">
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        {/* DET-1 */}
        <DomainFilterTabs
          active={activeDomain}
          onChange={(k) => setActiveDomain(k as "All" | SignalDomain)}
          tabs={[
            { key: "All", label: "All Signals", count: counts.All },
            ...SIGNAL_DOMAINS.map((d) => ({ key: d, label: d, count: counts[d] })),
          ]}
        />

        {/* DET-2 Signal ribbon + confidence legend */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile
              label="Total Signals"
              value={SIGNAL_RIBBON.total.value}
              delta={SIGNAL_RIBBON.total.delta}
              confidence={SIGNAL_RIBBON.confidence}
              icon={Radar}
            />
            <KpiTile
              label="High Risk"
              value={SIGNAL_RIBBON.high.value}
              delta={SIGNAL_RIBBON.high.delta}
              confidence="observed"
              icon={AlertTriangle}
              accentHex="#C0392B"
            />
            <KpiTile
              label="Medium Risk"
              value={SIGNAL_RIBBON.medium.value}
              delta={SIGNAL_RIBBON.medium.delta}
              confidence="observed"
              icon={Gauge}
              accentHex="#B06A00"
            />
            <KpiTile
              label="Low Risk"
              value={SIGNAL_RIBBON.low.value}
              delta={SIGNAL_RIBBON.low.delta}
              confidence="observed"
              icon={ThumbsUp}
              accentHex="#1E6B3A"
            />
            <KpiTile
              label="New Signals"
              value={SIGNAL_RIBBON.fresh.value}
              delta={SIGNAL_RIBBON.fresh.delta}
              confidence="observed"
              icon={BellRing}
              accentHex="#2563EB"
            />
            <KpiTile
              label="Acknowledged"
              value={SIGNAL_RIBBON.ack.value}
              delta={SIGNAL_RIBBON.ack.delta}
              confidence="observed"
              icon={CheckCheck}
              accentHex="#0E7C7B"
            />
          </div>
          <ConfidenceLegend />
        </section>

        {/* DET-3 Timeline + DET-4 Donut side-by-side, DET-7 signal list on right */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard>
              <PanelHead
                title="Signal Timeline"
                meta="Volume by risk band · last 24h"
              />
              <SignalTimelineChart
                data={range === "6H" ? SIGNAL_TIMELINE_6H : range === "7D" ? SIGNAL_TIMELINE_7D : SIGNAL_TIMELINE_24H}
                range={range}
                onRangeChange={setRange}
              />
            </PanelCard>
            <PanelCard>
              <PanelHead title="Signals by Domain" meta="Share of total volume" />
              <DomainDonutChart data={SIGNALS_BY_DOMAIN} />
            </PanelCard>
          </div>

          {/* DET-7 */}
          <PanelCard>
            <PanelHead
              title="Top High-Risk Signals"
              meta="Click to investigate"
            />
            {topHigh.length === 0 ? (
              <div className="type-small text-slate">
                No high-risk signals in the selected domain.
              </div>
            ) : (
              <SignalList signals={topHigh} onOpen={openSignal} />
            )}
          </PanelCard>
        </div>

        {/* DET-5 Heatmap + DET-6 Type tiles */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <PanelCard>
            <PanelHead title="Signal Risk Heatmap" meta="Domains × risk levels" />
            <RiskHeatmap rows={RISK_HEATMAP} />
          </PanelCard>
          <PanelCard>
            <PanelHead title="Signals by Type" meta="Distribution across signal types" />
            <TypeTiles items={SIGNAL_TYPE_TILES} />
          </PanelCard>
        </div>

        {/* DET-8 Recent signals table */}
        <PanelCard>
          <PanelHead title="Recent Signals" meta={`${filtered.length} in view`} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="type-label bg-surface-2 text-slate">
                <tr>
                  <th className="px-3 py-2 text-left">Signal</th>
                  <th className="px-3 py-2 text-left">Domain</th>
                  <th className="px-3 py-2 text-left">Risk</th>
                  <th className="px-3 py-2 text-left">Confidence</th>
                  <th className="px-3 py-2 text-left">Detected</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-line hover:bg-surface-2/60 cursor-pointer"
                    onClick={() => openSignal(s)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">{s.title}</div>
                      <div className="text-[11px] text-slate">{s.detail}</div>
                    </td>
                    <td className="px-3 py-2 text-foreground/80">{s.domain}</td>
                    <td className="px-3 py-2"><RiskPill level={s.risk} /></td>
                    <td className="px-3 py-2"><ConfidenceChip tier={s.confidence} size={9} /></td>
                    <td className="px-3 py-2 text-slate">{s.detectedLabel}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        s.status === "NEW"
                          ? "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
                          : "bg-surface-2 text-slate"
                      }`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>

        {/* DET-9 AI Signal Summary */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[color:var(--color-purple)]" />
            <h2 className="type-h1 text-foreground">AI Signal Summary</h2>
            <span className="type-small text-slate">
              · Copilot Insights, observed language, evidence-linked
            </span>
          </div>
          <CopilotCards cards={AI_SIGNAL_SUMMARY} />
        </section>

        {/* DET-10 Footer */}
        <p className="rounded-md border border-line bg-surface-2/60 px-4 py-2 text-[11px] text-slate">
          <Bell className="mr-1 inline h-3 w-3 -mt-0.5" />
          Confidence levels are assigned per OC-001 Confidence Ladder. Click any
          signal to view evidence and sources.
        </p>
      </div>
    </AppShell>
  );
}
