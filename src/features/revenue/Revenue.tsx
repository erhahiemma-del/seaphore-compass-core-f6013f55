/**
 * SPRINT OPS-02 — Revenue Intelligence Centre (migrated).
 *
 * Replaces all intel-centre-data.ts imports with the Canonical UIP
 * via the existing `useCargoCentreProjection` hook bound to the
 * `revenue` centre definition (capability.revenue-leakage-detection).
 *
 * Runtime flow:
 *   Officer UI → useCargoCentreProjection (revenue)
 *             → projectCargoCentre (revenue case: scanForLeakage findings)
 *             → Canonical UIP (useUipStore)
 *             → IFE (fuseEvidence / buildUnifiedIntelligencePackage)
 *             → IAL (acquireEvidence)
 *             → Evidence Provider (NcsCustomsProvider / simulators)
 */
import { useMemo, useState } from "react";
import { ArrowRight, Columns3, Download, LineChart } from "lucide-react";

import {
  CheckList,
  FilterBlock,
  FilterSearch,
  IntelCentreShell,
  SavedViewList,
} from "@/components/intel-centre/shell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { DataTable, Section } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";

import { cargoCentreBySlug } from "@/lib/intelligence/cargo-workspace-projection";
import { useCargoCentreProjection } from "@/features/cargo-workspace/use-cargo-projection";

const REVENUE_CENTRE = cargoCentreBySlug("revenue")!;

function useRevenueKpis(
  projection: ReturnType<typeof useCargoCentreProjection>["projection"],
): KpiSpec[] {
  return useMemo(() => {
    if (!projection.data) return [];
    return projection.data.kpis.map((k) => ({
      label: k.label,
      value: k.value,
      confidence: k.confidence,
      hint: k.hint,
    }));
  }, [projection.data]);
}

export function RevenueCentre() {
  const [tab, setTab] = useState("workspace");
  const { projection, isLoading } = useCargoCentreProjection(REVENUE_CENTRE);
  const kpis = useRevenueKpis(projection);

  const hasData = projection.state === "ACTIVE" && !!projection.data;

  return (
    <IntelCentreShell
      title="Revenue Intelligence"
      subtitle="Duty exposure and leakage detected on cargo evidence"
      kpiRibbon={
        kpis.length > 0 ? (
          <KpiRibbon items={kpis} />
        ) : (
          <PanelStateNotice
            state={projection.state}
            detail={projection.stateDetail}
            href="/admin/provider-health"
            hrefLabel="Inspect provider health"
          />
        )
      }
      tabs={[
        { key: "workspace", label: "Workspace" },
        { key: "findings", label: "Leakage Findings", count: projection.data?.evidenceCount },
        { key: "evidence", label: "Evidence" },
        { key: "analytics", label: "Analytics" },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      tabTrailing={
        <>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50">
            <LineChart className="h-3 w-3" /> Analytics
          </button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50">
            <Download className="h-3 w-3" /> Export
          </button>
          <button className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2/50">
            <Columns3 className="h-3 w-3" /> Columns
          </button>
        </>
      }
      filters={
        <>
          <FilterSearch placeholder="Search company, port, voyage…" />
          <FilterBlock label="Saved views">
            <SavedViewList views={["Top leakage", "3% Levy audit", "Repeat under-declare"]} />
          </FilterBlock>
          <FilterBlock label="Time range">
            <CheckList
              options={["Today", "Last 7d", "Last 30d", "FY 2026"]}
              defaultChecked={["Today"]}
            />
          </FilterBlock>
          <FilterBlock label="Port">
            <CheckList
              options={["Apapa Port", "Tin Can Island", "Onne Port", "Port Harcourt", "Calabar"]}
              defaultChecked={["Apapa Port"]}
            />
          </FilterBlock>
          <FilterBlock label="Risk">
            <CheckList options={["High", "Medium", "Low"]} defaultChecked={["High"]} />
          </FilterBlock>
          <FilterBlock label="Agency">
            <CheckList options={["NCS", "FIRS", "NIMASA"]} />
          </FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {!hasData ? (
            <Section>
              <PanelStateNotice
                state={projection.state}
                detail={isLoading ? "Loading revenue intelligence…" : projection.stateDetail}
                href={REVENUE_CENTRE.capabilityHref}
                hrefLabel="Inspect revenue leakage capability"
              />
              <div className="mt-3 space-y-1">
                {projection.recommendedActions.map((a) => (
                  <p key={a} className="flex items-start gap-1.5 text-[12px] text-foreground/80">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                    {a}
                  </p>
                ))}
              </div>
            </Section>
          ) : (
            <>
              {/* KPI summary cards from the revenue projection */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {projection.data!.kpis.map((k) => (
                  <div key={k.key} className="rounded-lg border border-line/60 bg-surface/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-slate">
                        {k.label}
                      </span>
                      <ConfidenceChip tier={k.confidence} size={9} />
                    </div>
                    <div className="mt-1 text-[18px] font-semibold text-foreground">{k.value}</div>
                    <p className="mt-1 text-[10.5px] text-slate">{k.hint}</p>
                  </div>
                ))}
              </div>

              {/* Revenue leads — entities with evidence weight */}
              <Section title="Leads by Evidence Weight">
                <DataTable
                  columns={[
                    {
                      key: "entity",
                      label: "Entity",
                      render: (r: NonNullable<typeof projection.data>["leads"][number]) => (
                        <span className="font-semibold text-foreground">{r.label}</span>
                      ),
                    },
                    {
                      key: "id",
                      label: "Canonical ID",
                      render: (r) => (
                        <span className="font-mono text-[11px] text-slate">{r.entityId}</span>
                      ),
                    },
                    {
                      key: "count",
                      label: "Evidence",
                      align: "right",
                      render: (r) => <span className="font-semibold">{r.evidenceCount}</span>,
                    },
                    {
                      key: "conf",
                      label: "Confidence",
                      align: "right",
                      render: (r) => <ConfidenceChip tier={r.confidence} size={9} />,
                    },
                  ]}
                  rows={projection.data!.leads}
                  rowKey={(r) => r.entityId}
                  compact
                />
              </Section>

              {/* Evidence records */}
              <Section title="Revenue Evidence Records">
                <ul className="divide-y divide-line/60">
                  {projection.data!.evidence.map((e) => (
                    <li key={e.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold text-foreground">
                          {e.title}
                        </span>
                        <ConfidenceChip tier={e.confidence} size={9} />
                      </div>
                      <div className="font-mono mt-0.5 truncate text-[11px] text-slate">
                        {e.source} · {e.grade} · {e.observedAt.slice(0, 10)} · {e.hash.slice(0, 12)}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Intelligence status */}
              <Section title="Intelligence Status">
                <dl className="space-y-1.5 text-[12px]">
                  <Row label="Canonical UIP" value={projection.uipId ?? "—"} />
                  <Row label="Findings / records" value={String(projection.data!.evidenceCount)} />
                  <Row label="Confidence" value={projection.data!.confidence} />
                  <Row label="Capability" value={REVENUE_CENTRE.capabilityId} />
                </dl>
                <p className="mt-2 text-[11px] text-slate">
                  Officer approval is required before any enforcement action. System recommends;
                  officer decides.
                </p>
              </Section>
            </>
          )}
        </div>
      }
      copilot={
        <CentreCopilot
          name="Revenue Assurance Copilot"
          instance="revenue"
          observed={
            hasData
              ? projection.data!.summary.map((s) => ({
                  title: s.slice(0, 60),
                  detail: s,
                  confidence: "observed" as const,
                }))
              : [
                  {
                    title: "No revenue evidence in session",
                    detail: projection.stateDetail,
                    confidence: "inferred" as const,
                  },
                ]
          }
          recommendations={projection.recommendedActions.map((a) => ({
            title: a,
            detail: "System recommends; officer decides. Enforcement requires officer approval.",
            confidence: "inferred" as const,
          }))}
          historical={[]}
          related={[]}
        />
      }
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/40 py-1 last:border-b-0">
      <dt className="text-slate">{label}</dt>
      <dd className="font-mono max-w-[60%] truncate text-right text-[11px] text-foreground/85">
        {value}
      </dd>
    </div>
  );
}
