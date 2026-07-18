import { useEffect, useMemo, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ConfidenceLegend } from "@/components/confidence-legend";
import { CopilotCards } from "@/components/copilot-cards";
import { DomainDonutChart } from "@/components/domain-donut-chart";
import { DomainFilterTabs } from "@/components/domain-filter-tabs";
import { KpiTile } from "@/components/kpi-tile";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskHeatmap } from "@/components/risk-heatmap";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { SignalList } from "@/components/signal-list";
import { SignalTimelineChart, type TimelineRange } from "@/components/signal-timeline-chart";
import { TypeTiles } from "@/components/type-tiles";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { useHandoffNavigate } from "@/lib/nav-context";
import { QUERY_KEYS, QUERY_STALE } from "@/lib/query-keys";
import {
  getDetectFeed,
  SIGNAL_DOMAINS,
  type Signal,
  type SignalDomain,
} from "@/services/detect.service";

export function DetectPage() {
  const [activeDomain, setActiveDomain] = useState<"All" | SignalDomain>("All");
  const [range, setRange] = useState<TimelineRange>("24H");
  const handoff = useHandoffNavigate();

  const [authState, setAuthState] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthState(data.session ? "in" : "out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthState(session ? "in" : "out");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...QUERY_KEYS.signals(activeDomain === "All" ? undefined : activeDomain), range],
    queryFn: () => getDetectFeed({ range, domain: activeDomain }),
    staleTime: QUERY_STALE.signals,
    refetchOnWindowFocus: false,
    enabled: authState === "in",
  });

  const signals = data?.signals ?? [];
  const counts = data?.countsByDomain ?? ({ All: 0 } as Record<SignalDomain | "All", number>);
  const ribbon = data?.ribbon;

  const topHigh = useMemo(
    () => signals.filter((s) => s.risk === "HIGH").slice(0, 5),
    [signals],
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

  if (authState === "out") return <Navigate to="/auth" />;

  return (
    <AppShell title="Detect" subtitle="Intelligence Feed" mode="light">
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        {/* DET-1 */}
        <DomainFilterTabs
          active={activeDomain}
          onChange={(k) => setActiveDomain(k as "All" | SignalDomain)}
          tabs={[
            { key: "All", label: "All Signals", count: counts.All ?? 0 },
            ...SIGNAL_DOMAINS.map((d) => ({ key: d, label: d, count: counts[d] ?? 0 })),
          ]}
        />

        {isError ? (
          <PanelCard>
            <PanelHead title="Signal feed unavailable" meta="Retry" />
            <p className="text-[12px] text-slate">
              The Detect service could not reach the signal store. This may be a network
              issue or session expiry.
            </p>
            <button
              type="button"
              className="mt-2 rounded-md border border-line px-3 py-1 text-[12px] hover:bg-surface-2"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </PanelCard>
        ) : null}

        {/* DET-2 Signal ribbon + confidence legend */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile
              label="Total Signals"
              value={ribbon?.total.value ?? 0}
              delta={ribbon?.total.delta ?? 0}
              confidence={ribbon?.confidence ?? "observed"}
              icon={Radar}
            />
            <KpiTile label="High Risk" value={ribbon?.high.value ?? 0} delta={ribbon?.high.delta ?? 0} confidence="observed" icon={AlertTriangle} accentHex="#C0392B" />
            <KpiTile label="Medium Risk" value={ribbon?.medium.value ?? 0} delta={ribbon?.medium.delta ?? 0} confidence="observed" icon={Gauge} accentHex="#B06A00" />
            <KpiTile label="Low Risk" value={ribbon?.low.value ?? 0} delta={ribbon?.low.delta ?? 0} confidence="observed" icon={ThumbsUp} accentHex="#1E6B3A" />
            <KpiTile label="New Signals" value={ribbon?.fresh.value ?? 0} delta={ribbon?.fresh.delta ?? 0} confidence="observed" icon={BellRing} accentHex="#2563EB" />
            <KpiTile label="Acknowledged" value={ribbon?.ack.value ?? 0} delta={ribbon?.ack.delta ?? 0} confidence="observed" icon={CheckCheck} accentHex="#0E7C7B" />
          </div>
          <ConfidenceLegend />
        </section>

        {/* DET-3 Timeline + DET-4 Donut side-by-side, DET-7 signal list on right */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard>
              <PanelHead title="Signal Timeline" meta={`Volume by risk band · ${range}`} />
              <SignalTimelineChart
                data={data?.timeline ?? []}
                range={range}
                onRangeChange={setRange}
              />
            </PanelCard>
            <PanelCard>
              <PanelHead title="Signals by Domain" meta="Share of total volume" />
              <DomainDonutChart data={data?.domainSlice ?? []} />
            </PanelCard>
          </div>

          {/* DET-7 */}
          <PanelCard>
            <PanelHead title="Top High-Risk Signals" meta="Click to investigate" />
            {isLoading ? (
              <div className="type-small text-slate">Loading signals…</div>
            ) : topHigh.length === 0 ? (
              <div className="type-small text-slate">No high-risk signals in the selected domain.</div>
            ) : (
              <SignalList signals={topHigh} onOpen={openSignal} />
            )}
          </PanelCard>
        </div>

        {/* DET-5 Heatmap + DET-6 Type tiles */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <PanelCard>
            <PanelHead title="Signal Risk Heatmap" meta="Domains × risk levels" />
            <RiskHeatmap rows={data?.heatmap ?? []} />
          </PanelCard>
          <PanelCard>
            <PanelHead title="Signals by Type" meta="Distribution across signal types" />
            <TypeTiles items={data?.typeTiles ?? []} />
          </PanelCard>
        </div>

        {/* DET-8 Recent signals table */}
        <PanelCard>
          <PanelHead title="Recent Signals" meta={`${signals.length} in view`} />
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
                {signals.map((s) => (
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
                {!isLoading && signals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate text-[12px]">
                      No signals observed for the current filter.
                    </td>
                  </tr>
                ) : null}
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
          <CopilotCards cards={data?.aiSummary ?? []} />
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
