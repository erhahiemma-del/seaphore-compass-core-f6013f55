/**
 * Tiered operational signals.
 *
 * Presentation only: the values, states and confidence all come from the
 * existing coverage model via `KpiCoverageCard`. This module decides nothing
 * about the numbers; it renders the six approved operational signals as equal
 * cards so Mission Control keeps its approved geometry.
 */
import {
  Activity,
  Container,
  FileText,
  History,
  Landmark,
  Ship,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { IntelligenceReadinessCard } from "@/components/intelligence/IntelligenceReadinessCard";
import { KpiCoverageCard } from "@/components/intelligence/KpiCoverageCard";
import type { IntelligenceCoverageReport, KpiCoverage } from "@/lib/intelligence/coverage-model";
import { RIBBON_KPIS } from "@/lib/mission-control-data";
import { cn } from "@/lib/utils";

const RIBBON_ICONS: Record<string, LucideIcon> = {
  "manifest-intelligence": FileText,
  "vessel-intelligence": Ship,
  "container-intelligence": Container,
  "revenue-intelligence": Landmark,
  "risk-intelligence": Target,
  "historical-intelligence": History,
};

/** Officer-facing capability routes reused by the ribbon (no duplicates). */
const KPI_HANDOFF_OVERRIDE: Record<string, string> = {
  "revenue-intelligence": "/revenue-leakage",
  "risk-intelligence": "/national-risk",
};

/**
 * Which signal leads, per active intelligence mode.
 *
 * Ordering only. Every configured KPI stays on the page in every mode; the
 * mode changes emphasis, never availability.
 */
const LEAD_BY_MODE: Record<string, readonly string[]> = {
  imo: ["vessel-intelligence", "risk-intelligence"],
  vessel: ["vessel-intelligence", "risk-intelligence"],
  company: ["risk-intelligence", "historical-intelligence"],
  manifest: ["manifest-intelligence", "revenue-intelligence"],
  container: ["container-intelligence", "manifest-intelligence"],
  bol: ["manifest-intelligence", "revenue-intelligence"],
  voyage: ["vessel-intelligence", "manifest-intelligence"],
  port: ["vessel-intelligence", "container-intelligence"],
};

export interface KpiRibbonProps {
  readonly coverage: IntelligenceCoverageReport | undefined;
  /** Active intelligence mode key — drives emphasis only. */
  readonly mode?: string;
  readonly onOpen: (target: string) => void;
}

function PendingKpi({
  title,
  descriptor,
  hint,
  icon: Icon,
  onOpen,
}: {
  title: string;
  descriptor: string;
  hint?: string;
  icon: LucideIcon;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={hint}
      className={cn(
        "group flex flex-col rounded-lg border border-line bg-surface text-left elev-1 motion-fast hover:border-[color:var(--ocean)]/60",
        "p-3",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--ocean-050)] text-[color:var(--ocean)]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="type-label text-slate">{title}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-[color:var(--status-inactive)] opacity-70"
        />
        Checking coverage…
      </div>
      <div className="mt-0.5 text-[11px] font-semibold text-slate">{descriptor}</div>
    </button>
  );
}

export function KpiRibbon({ coverage, mode, onOpen }: KpiRibbonProps) {
  const kpiByKey = new Map<string, KpiCoverage>(
    (coverage?.kpis ?? []).map((k) => [k.key, k] as const),
  );
  const leadKeys = LEAD_BY_MODE[mode ?? ""] ?? ["risk-intelligence", "revenue-intelligence"];

  type RibbonKpi = (typeof RIBBON_KPIS)[number];
  const ordered: RibbonKpi[] = [...RIBBON_KPIS];

  const render = (kpi: RibbonKpi) => {
    const Icon = RIBBON_ICONS[kpi.key] ?? Activity;
    const cov = kpiByKey.get(kpi.metricKey);
    const target = KPI_HANDOFF_OVERRIDE[kpi.key] ?? kpi.handoff;
    const emphasized = leadKeys.includes(kpi.key);
    if (cov) {
      return (
        <div key={kpi.key} className={cn(emphasized && "rounded-lg ring-2 ring-[color:var(--ocean)]/20")}>
          <KpiCoverageCard kpi={cov} icon={Icon} onOpen={() => onOpen(target)} />
        </div>
      );
    }
    return (
      <PendingKpi
        key={kpi.key}
        title={kpi.title}
        descriptor={kpi.descriptor}
        hint={kpi.hint}
        icon={Icon}
        onOpen={() => onOpen(target)}
      />
    );
  };

  return (
    <section aria-label="Operational KPI signals" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-label text-slate">Operational KPI signals</h2>
        {coverage ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-[12px] font-semibold text-[color:var(--ocean)] hover:underline">
              Intelligence readiness
            </summary>
            <div className="mt-2">
              <IntelligenceReadinessCard
                readiness={coverage.readiness}
                generatedAt={coverage.generatedAt}
                report={coverage}
              />
            </div>
          </details>
        ) : null}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {ordered.map((k: RibbonKpi) => render(k))}
      </div>
    </section>
  );
}
