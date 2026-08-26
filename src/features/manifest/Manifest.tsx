/**
 * SPRINT OPS-02 — Manifest Intelligence Centre (migrated).
 *
 * Replaces all intel-centre-data.ts imports with the Canonical UIP
 * via the existing `useCargoCentreProjection` hook bound to the
 * `manifest` centre definition. The shell, filters, copilot, and
 * visual layout are preserved; only the data source changes.
 *
 * Runtime flow:
 *   Officer UI → useCargoCentreProjection (manifest)
 *             → projectCargoCentre
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
  IntelCentreLayout,
  SavedViewList,
} from "@/components/intel-centre/shell";
import { AppShell } from "@/components/layout/AppShell";
import { KpiRibbon, type KpiSpec } from "@/components/intel-centre/kpi-ribbon";
import { CentreCopilot } from "@/components/intel-centre/centre-copilot";
import { Section } from "@/components/intel-centre/primitives";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { MapCanvas } from "@/features/maritime/MapCanvas";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";

import { cargoCentreBySlug } from "@/lib/intelligence/cargo-workspace-projection";
import { useCargoCentreProjection } from "@/features/cargo-workspace/use-cargo-projection";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

/** The manifest centre definition — resolved from the frozen CARGO_CENTRES registry. */
const MANIFEST_CENTRE = cargoCentreBySlug("manifest")!;

/**
 * Map a CargoCentreProjection's KPIs onto KpiSpec for the ribbon.
 * When the projection has no data we return a single honest-state tile.
 */
function useManifestKpis(
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

export function ManifestCentre() {
  const [tab, setTab] = useState("workspace");
  const { projection, isLoading } = useCargoCentreProjection(MANIFEST_CENTRE);
  const kpis = useManifestKpis(projection);

  const hasData = projection.state === "ACTIVE" && !!projection.data;

  return (
    <>
      <DemoDataNotice surface="The tables on this page" className="mb-3" />
      <AppShell mode="dark" capabilities={{ commandSurface: true, focus: true }}>
        <IntelCentreLayout
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
            { key: "evidence", label: "Evidence", count: projection.data?.evidenceCount },
            { key: "timeline", label: "Timeline" },
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
              <FilterBlock label="Saved views">
                <SavedViewList
                  views={["High risk arrivals", "Duplicates today", "Amended manifests"]}
                />
              </FilterBlock>
              <FilterBlock label="Time range">
                <CheckList
                  options={["Last 24h", "Last 7d", "Last 30d"]}
                  defaultChecked={["Last 24h"]}
                />
              </FilterBlock>
              <FilterBlock label="Port">
                <CheckList
                  options={["Apapa", "Tin Can", "Onne", "Port Harcourt", "Calabar"]}
                  defaultChecked={["Apapa", "Tin Can"]}
                />
              </FilterBlock>
              <FilterBlock label="Status">
                <CheckList options={["Validated", "Pending", "Duplicate", "Amended"]} />
              </FilterBlock>
              <FilterBlock label="Risk">
                <CheckList
                  options={["High", "Medium", "Low"]}
                  defaultChecked={["High", "Medium"]}
                />
              </FilterBlock>
              <FilterBlock label="Agency">
                <CheckList options={["NCS", "NPA", "NIMASA"]} />
              </FilterBlock>
              <FilterBlock label="Watchlists">
                <CheckList
                  options={["High Risk Vessels", "Sanctioned Entities", "Repeat Offenders"]}
                />
              </FilterBlock>
            </>
          }
          main={
            <div className="space-y-4">
              {/*
              The shared MapLibre engine under a manifest lens. Same
              renderer, same SGS, same layer registry as the command
              surfaces — only the active layers differ.
            */}
              <div className="relative h-[300px] overflow-hidden rounded-lg border border-line">
                <MapCanvas mode="context" domain="manifest" />
                <MapCoverageNote />
              </div>

              {!hasData ? (
                <Section>
                  <PanelStateNotice
                    state={projection.state}
                    detail={isLoading ? "Loading intelligence coverage…" : projection.stateDetail}
                    href={MANIFEST_CENTRE.capabilityHref}
                    hrefLabel="Inspect capability"
                  />
                  <div className="mt-3 space-y-1">
                    {projection.recommendedActions.map((a) => (
                      <p
                        key={a}
                        className="flex items-start gap-1.5 text-[12px] text-foreground/80"
                      >
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                        {a}
                      </p>
                    ))}
                  </div>
                </Section>
              ) : (
                <>
                  {/* Evidence timeline from the Canonical UIP */}
                  <Section title="Manifest Evidence · Canonical UIP">
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
                            <span className="block truncate text-[11px] text-slate">
                              {t.detail}
                            </span>
                          </span>
                          <ConfidenceChip tier={t.confidence} size={9} />
                        </li>
                      ))}
                    </ol>
                  </Section>

                  {/* Evidence records with provenance */}
                  <Section title="Evidence Records">
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
                            {e.source} · {e.grade} · {e.hash.slice(0, 12)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Section>

                  {/* Intelligence status */}
                  <Section title="Intelligence Status">
                    <dl className="space-y-1.5 text-[12px]">
                      <Row label="Canonical UIP" value={projection.uipId ?? "—"} />
                      <Row
                        label="Evidence records"
                        value={String(projection.data!.evidenceCount)}
                      />
                      <Row label="Confidence" value={projection.data!.confidence} />
                      <Row
                        label="Projection binding"
                        value={MANIFEST_CENTRE.projectionContractId}
                      />
                    </dl>
                    <p className="mt-2 text-[11px] text-slate">
                      System recommends; officer decides. Evidence first. Explainable always.
                    </p>
                  </Section>
                </>
              )}
            </div>
          }
          copilot={
            <CentreCopilot
              name="Manifest Copilot"
              instance="manifest"
              observed={
                hasData
                  ? projection.data!.summary.map((s) => ({
                      title: s.slice(0, 60),
                      detail: s,
                      confidence: "observed" as const,
                    }))
                  : [
                      {
                        title: "No evidence in session",
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
      </AppShell>
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

/**
 * What the map shows, and what it deliberately does not draw.
 *
 * Ports and the EEZ are verified geography. The movement this domain
 * cares about lives only in demonstration fixtures, so no route is
 * rendered: drawing one would put an unobserved voyage on the map with
 * the same visual authority as a real one.
 */
function MapCoverageNote() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 max-w-[300px] rounded border border-line/70 bg-surface/90 px-2.5 py-1.5 backdrop-blur-sm">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate">
        Manifest geography
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate">
        Ports and Nigerian EEZ shown from verified geography. Origin, transit and destination for
        this manifest come from demonstration fixtures, so no route is drawn — a line here would
        assert a voyage nobody observed.
      </p>
    </div>
  );
}
