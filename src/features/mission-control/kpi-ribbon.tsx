/**
 * Mission Control KPI ribbon.
 *
 * Presentation only. Values, coverage states and confidence all come from the
 * existing coverage model (`IntelligenceCoverageReport`) — this module owns no
 * KPI state, invents no numbers and fabricates no trends. Mission Mode may
 * reorder/emphasise the six signals; it never removes one.
 */
import {
  AlertTriangle,
  Anchor,
  ClipboardList,
  FileWarning,
  Ship,
  Target,
  type LucideIcon,
} from "lucide-react";

import { IntelligenceReadinessCard } from "@/components/intelligence/IntelligenceReadinessCard";
import { Sparkline } from "@/components/intel-centre/kpi-ribbon";
import type { IntelligenceCoverageReport, KpiCoverage } from "@/lib/intelligence/coverage-model";
import { RIBBON_KPIS } from "@/lib/mission-control-data";
import { cn } from "@/lib/utils";

/**
 * Semantic identity per KPI: RED = exposure/exception, AMBER = pending
 * attention, GREEN = healthy/active, PURPLE = investigation activity.
 * Colour carries meaning here, never decoration.
 */
interface KpiSkin {
  icon: LucideIcon;
  /** Icon glyph + pale icon plate. */
  iconClass: string;
  plateClass: string;
  /** Value colour: red for exposure/exception, navy otherwise. */
  valueClass: string;
  /** Sparkline / baseline stroke. */
  stroke: string;
  /** Fallback display when no measured value exists. */
  zero: string;
}

const KPI_SKIN: Record<string, KpiSkin> = {
  "revenue-intelligence": {
    icon: AlertTriangle,
    iconClass: "text-[color:var(--status-critical)]",
    plateClass: "bg-[color:var(--status-critical)]/10",
    valueClass: "text-[color:var(--status-critical)]",
    stroke: "#C0392B",
    zero: "₦0",
  },
  "manifest-intelligence": {
    icon: FileWarning,
    iconClass: "text-[color:var(--status-critical)]",
    plateClass: "bg-[color:var(--status-critical)]/10",
    valueClass: "text-[color:var(--status-critical)]",
    stroke: "#D4622A",
    zero: "0",
  },
  "risk-intelligence": {
    icon: ClipboardList,
    iconClass: "text-[color:var(--status-review)]",
    plateClass: "bg-[color:var(--status-review)]/12",
    valueClass: "text-foreground",
    stroke: "#D99518",
    zero: "0",
  },
  "vessel-intelligence": {
    icon: Ship,
    iconClass: "text-[color:var(--status-verified)]",
    plateClass: "bg-[color:var(--status-verified)]/12",
    valueClass: "text-foreground",
    stroke: "#1E6B3A",
    zero: "0",
  },
  "container-intelligence": {
    icon: Anchor,
    iconClass: "text-[color:var(--status-verified)]",
    plateClass: "bg-[color:var(--status-verified)]/12",
    valueClass: "text-foreground",
    stroke: "#1E6B3A",
    zero: "0",
  },
  "historical-intelligence": {
    icon: Target,
    iconClass: "text-[color:var(--intel-purple,#6D5BD0)]",
    plateClass: "bg-[color:var(--intel-purple,#6D5BD0)]/10",
    valueClass: "text-foreground",
    stroke: "#6D5BD0",
    zero: "0",
  },
};

/** Officer-facing capability routes reused by the ribbon (no duplicates). */
const KPI_HANDOFF_OVERRIDE: Record<string, string> = {
  "revenue-intelligence": "/revenue-leakage",
  "risk-intelligence": "/national-risk",
};

/**
 * Which signal leads, per active intelligence mode.
 *
 * Emphasis only. Every configured KPI stays on the page in every mode.
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

/**
 * One KPI card. Geometry is constant: icon + title, value, status line and a
 * reserved sparkline area. Missing data changes what the slots SAY, never
 * whether they exist.
 */
function KpiCard({
  title,
  skin,
  cov,
  emphasized,
  hint,
  onOpen,
}: {
  title: string;
  skin: KpiSkin;
  cov: KpiCoverage | undefined;
  emphasized: boolean;
  hint?: string;
  onOpen: () => void;
}) {
  const Icon = skin.icon;
  const measured = cov?.value != null;
  const value = measured ? cov!.display : skin.zero;
  /**
   * No comparison series is published by the coverage model, so no delta or
   * percentage is ever shown. The status line states the honest coverage
   * position instead, and the chart area holds a neutral baseline.
   */
  const status = measured ? (cov?.descriptor ?? "No change") : (cov?.stateLabel ?? "No change");

  return (
    <button
      type="button"
      onClick={onOpen}
      title={cov?.stateDetail ?? hint}
      className={cn(
        "group flex min-h-[112px] flex-col rounded-xl border border-line bg-surface px-3.5 py-3 text-left elev-1 motion-fast",
        "hover:border-[color:var(--ocean)]/60 hover:shadow-card",
        emphasized && "ring-2 ring-[color:var(--ocean)]/20",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            skin.plateClass,
            skin.iconClass,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
        <span className="truncate text-[12.5px] font-semibold text-foreground">{title}</span>
      </div>

      <div
        className={cn(
          "mt-1.5 type-mono text-[24px] font-bold leading-none tabular-nums",
          measured ? skin.valueClass : cn(skin.valueClass, "opacity-45"),
        )}
      >
        {value}
      </div>

      <div className="mt-1 truncate text-[11px] font-semibold text-slate">{status}</div>

      {/* Reserved chart area — always present, never fabricated. */}
      <div className="mt-auto flex h-[20px] items-end pt-2">
        <Sparkline data={[1, 1]} width={112} height={14} stroke={skin.stroke} opacity={0.4} />
      </div>
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
        {ordered.map((kpi: RibbonKpi) => (
          <KpiCard
            key={kpi.key}
            title={kpi.title}
            skin={KPI_SKIN[kpi.key] ?? KPI_SKIN["risk-intelligence"]}
            cov={kpiByKey.get(kpi.metricKey)}
            emphasized={leadKeys.includes(kpi.key)}
            hint={kpi.hint}
            onOpen={() => onOpen(KPI_HANDOFF_OVERRIDE[kpi.key] ?? kpi.handoff)}
          />
        ))}
      </div>
    </section>
  );
}
