/**
 * SPRINT OPS-02 — Cargo Intelligence Centre (migrated).
 *
 * Replaces all intel-centre-data.ts imports with the Canonical UIP
 * via the existing `useCargoCentreProjection` hook bound to the
 * `cargo` centre definition (commodities, HS codes, cargo items).
 *
 * Runtime flow:
 *   Officer UI → useCargoCentreProjection (cargo)
 *             → projectCargoCentre (cargo case: items, HS codes, DG flags)
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
import { SubjectHeader } from "@/components/intel-centre/subject-header";
import { useCentreFocus } from "@/components/intel-centre/use-centre-focus";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";

import { cargoCentreBySlug } from "@/lib/intelligence/cargo-workspace-projection";
import { useCargoCentreProjection } from "@/features/cargo-workspace/use-cargo-projection";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

const CARGO_CENTRE = cargoCentreBySlug("cargo")!;

function useCargoKpis(
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

export function CargoCentre() {
  const [tab, setTab] = useState("workspace");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const { projection, isLoading } = useCargoCentreProjection(CARGO_CENTRE);
  const kpis = useCargoKpis(projection);

  const hasData = projection.state === "ACTIVE" && !!projection.data;
  const lead = hasData
    ? (projection.data!.leads.find((l) => l.entityId === selectedLeadId) ?? null)
    : null;

  const { focused, dismiss, isReceded } = useCentreFocus(
    useMemo(
      () =>
        lead
          ? {
              kind: "cargo" as const,
              id: lead.entityId,
              title: lead.label,
              descriptor: lead.entityId,
              facts: [
                {
                  label: "Evidence records",
                  value: String(lead.evidenceCount),
                  confidence: lead.confidence,
                },
              ],
            }
          : null,
      [lead],
    ),
  );


  return (
    <>
      <DemoDataNotice surface="The tables on this page" className="mb-3" />
      <IntelCentreShell
      title="Cargo Intelligence"
      subtitle="Commodities, HS codes and cargo items inside every voyage"
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
        { key: "cargo", label: "Cargo Items", count: projection.data?.evidenceCount },
        { key: "hs", label: "HS Codes" },
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
          <FilterSearch placeholder="Search container, HS code, description…" />
          <FilterBlock label="Saved views">
            <SavedViewList views={["High risk cargo", "DG inbound", "Misclassified"]} />
          </FilterBlock>
          <FilterBlock label="Time range">
            <CheckList
              options={["Last 24h", "Last 7d", "Last 30d"]}
              defaultChecked={["Last 24h"]}
            />
          </FilterBlock>
          <FilterBlock label="Destination port">
            <CheckList
              options={["Apapa Port", "Tin Can Island", "Onne Port", "Port Harcourt", "Calabar"]}
              defaultChecked={["Apapa Port"]}
            />
          </FilterBlock>
          <FilterBlock label="Risk">
            <CheckList options={["High", "Medium", "Low"]} defaultChecked={["High"]} />
          </FilterBlock>
          <FilterBlock label="Watchlists">
            <CheckList options={["Dangerous Goods", "Sanctioned Consignees"]} />
          </FilterBlock>
        </>
      }
      main={
        <div className="space-y-4">
          {!hasData ? (
            <Section>
              <PanelStateNotice
                state={projection.state}
                detail={isLoading ? "Loading cargo intelligence…" : projection.stateDetail}
                href={CARGO_CENTRE.capabilityHref}
                hrefLabel="Inspect cargo capability"
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
              {focused && lead && (
                <SubjectHeader
                  kind="cargo"
                  title={lead.label}
                  descriptor={lead.entityId}
                  confidence={lead.confidence}
                  evidence={[
                    {
                      label: "Evidence",
                      value: String(lead.evidenceCount),
                      confidence: lead.confidence,
                    },
                    { label: "Capability", value: "CARGO v1.0" },
                  ]}
                  onDismiss={() => {
                    setSelectedLeadId(null);
                    dismiss();
                  }}
                />
              )}

              {/* KPI summary cards */}
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

              {/* Cargo investigation leads */}
              <Section title="Cargo Leads · Evidence Weight">
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
                  onRowClick={(r) => setSelectedLeadId(r.entityId)}
                  compact
                />
              </Section>

              {/* Evidence timeline */}
              <Section title="Cargo Evidence · Observation Order">
                <ol className="divide-y divide-line/60">
                  {projection.data!.timeline.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 py-2.5">
                      <span className="font-mono whitespace-nowrap text-[11px] text-slate">
                        {t.at.slice(0, 16).replace("T", " ")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-foreground">
                          {t.title}
                        </span>
                        <span className="block truncate text-[11px] text-slate">{t.detail}</span>
                      </span>
                      <ConfidenceChip tier={t.confidence} size={9} />
                    </li>
                  ))}
                </ol>
              </Section>

              {/* Intelligence status */}
              <Section title="Intelligence Status" receded={isReceded("cargo")}>
                <dl className="space-y-1.5 text-[12px]">
                  <Row label="Canonical UIP" value={projection.uipId ?? "—"} />
                  <Row
                    label="Cargo evidence records"
                    value={String(projection.data!.evidenceCount)}
                  />
                  <Row label="Confidence" value={projection.data!.confidence} />
                  <Row label="Projection binding" value={CARGO_CENTRE.projectionContractId} />
                </dl>
                <p className="mt-2 text-[11px] text-slate">
                  Evidence first. Explainable always. Officer decides.
                </p>
              </Section>
            </>
          )}
        </div>
      }
      copilot={
        <CentreCopilot
          name="Cargo Truth Engine"
          instance="cargo"
          observed={
            hasData
              ? projection.data!.summary.map((s) => ({
                  title: s.slice(0, 60),
                  detail: s,
                  confidence: "observed" as const,
                }))
              : [
                  {
                    title: "No cargo evidence in session",
                    detail: projection.stateDetail,
                    confidence: "inferred" as const,
                  },
                ]
          }
          recommendations={projection.recommendedActions.map((a) => ({
            title: a,
            detail: "System recommends; officer decides.",
            confidence: "inferred" as const,
          }))}
          historical={[]}
          related={[]}
        />
      }
      />
    </>
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
