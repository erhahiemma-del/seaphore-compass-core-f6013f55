/**
 * Next Best Action — the strongest decision surface on Mission Control.
 *
 * Presentation only. It renders the highest-priority item the existing
 * `projectTodaysPriorities` projection produced; it does not re-rank, score
 * or invent anything. Exposure, evidence counts, verification level and the
 * response window all arrive on the projected item, so the banner repopulates
 * on its own the moment a scan completes.
 *
 * Persistent geometry: the six-column banner is never removed or collapsed
 * because data is missing. Missing values render as neutral placeholders
 * ("—", 0, "Awaiting evidence") inside the same slots.
 *
 * Responsive: the six columns stack to one on phones, pair up from `sm`,
 * form a 3×2 grid from `md`, and only become the reference six-across strip
 * at `xl`. Vertical dividers are only drawn on the row that actually has a
 * neighbour to its left, so no orphan rules appear when the grid rewraps.
 */
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, Clock, FileText, GitCompareArrows, Layers, User } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import type { PanelProjection, PrioritiesPanelData } from "@/lib/intelligence/dashboard-projection";
import { cn } from "@/lib/utils";

const VERIFY_PCT: Record<string, number> = {
  verified: 100,
  corroborated: 80,
  observed: 60,
  reported: 45,
  inferred: 30,
  unconfirmed: 12,
  unknown: 12,
};

/** Compact currency, so a nine-figure exposure never breaks the column. */
function formatExposure(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
  }
}

/**
 * Remaining time against the declared response window. Returns null when the
 * timestamp is unusable — a due-in the officer cannot trust is not shown.
 */
function formatDueIn(detectedAt: string, windowHours: number): string | null {
  const detected = Date.parse(detectedAt);
  if (!Number.isFinite(detected)) return null;
  const msLeft = detected + windowHours * 3_600_000 - Date.now();
  if (msLeft <= 0) return "Overdue";
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.round(msLeft / 60_000))}m`;
}


/**
 * Divider rules per column position.
 *
 * The banner rewraps 1 → 2 → 3 → 6 columns and the action block spans the
 * whole first row below `xl`, so "has a neighbour to the left" changes with
 * the breakpoint. `index` is 1-based across the five metric columns; the rule
 * is dropped wherever that column starts a row.
 */
function dividerClasses(index: number): string {
  const pos = index - 1; // position among the five metric columns
  return cn(
    "border-[color:var(--nba-divider)]",
    // Stacked: a hairline above each column instead of beside it.
    "border-t sm:border-t-0",
    pos % 2 === 1 ? "sm:border-l" : "sm:border-l-0",
    pos % 3 !== 0 ? "md:border-l" : "md:border-l-0",
    "xl:border-l",
  );
}

function Column({
  label,
  index,
  children,
  className,
}: {
  label: string;
  /** Position in the six-column order; drives responsive dividers. */
  index: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 pt-4 sm:pt-0 lg:px-5", dividerClasses(index), className)}>
      <div className="type-label text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
        {label}
      </div>
      <div className="mt-2 min-w-0 text-[13px] font-semibold leading-snug text-white/90">
        {children}
      </div>
    </div>
  );
}

function EvidenceStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof FileText;
  value: number | string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--nba-edge)] bg-white/[0.06] text-[color:var(--nba-operational-soft)]">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <span className="whitespace-nowrap text-[12.5px] font-semibold text-white/85">
        {value} {label}
      </span>
    </span>
  );
}

export function NextBestAction({
  projection,
  onAct,
}: {
  projection: PanelProjection<PrioritiesPanelData>;
  onAct: (subjectId: string) => void;
}) {
  const items = projection.data?.items ?? [];
  const item = items[0] ?? null;

  // A due-in that never moves is a stale number. One minute tick keeps the
  // remaining window honest without touching the data layer.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const badge = item ? `${item.priority} priority` : projection.stateLabel;
  const title = item ? item.entityName : "Awaiting evidence";
  const description = item ? item.rationale : projection.stateDetail;
  const confidence = item?.confidence ?? "unconfirmed";
  const verifyPct = VERIFY_PCT[confidence] ?? 12;
  const verified = confidence === "verified";
  const statusColor = verified ? "var(--nba-operational-soft)" : "var(--nba-verify)";
  const statusLabel = verified ? "Verified" : "Verification Required";
  const records = item?.records ?? 0;
  const sources = item?.sources ?? 0;
  const exposure = item ? formatExposure(item.exposure, item.exposureCurrency) : "—";
  const dueIn = item ? formatDueIn(item.detectedAt, item.responseWindowHours) : null;

  return (
    <section
      aria-label="Next best action"
      data-testid="next-best-action"
      className="relative overflow-hidden rounded-xl border border-[color:var(--nba-edge)] bg-[color:var(--nba-surface)]"
      style={{ boxShadow: "var(--nba-shadow)" }}
    >
      {/* dimensional blue depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 180% at 12% 0%, var(--nba-surface-hi) 0%, transparent 55%), radial-gradient(90% 160% at 96% 100%, rgba(30,99,200,0.28) 0%, transparent 60%)",
        }}
      />
      <div className="relative grid grid-cols-1 items-stretch gap-y-4 py-5 sm:grid-cols-2 sm:gap-y-5 md:grid-cols-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.55fr)]">
        {/* 1 — NEXT BEST ACTION — spans the full first row until the six-across strip. */}
        <div className="min-w-0 px-4 sm:col-span-2 md:col-span-3 lg:px-5 xl:col-span-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-label text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
              Next best action
            </span>
            <span
              className="rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.08em] text-white"
              style={{ backgroundColor: "var(--nba-oxblood)" }}
            >
              {badge}
            </span>
          </div>

          <div className="mt-2.5 flex min-w-0 items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                backgroundColor: "color-mix(in oklab, var(--nba-amber) 82%, transparent)",
                boxShadow: "0 0 0 1px color-mix(in oklab, var(--nba-verify) 45%, transparent)",
              }}
            >
              <ClipboardCheck className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-bold tracking-tight text-white">{title}</h2>
              <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-white/65">
                {description}
              </p>
              {item ? (
                <button
                  type="button"
                  onClick={() => onAct(item.id)}
                  className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)] motion-fast hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  style={{ backgroundColor: "var(--nba-cta)" }}
                >
                  Review Evidence
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <a
                  href={projection.capabilityHref}
                  className="mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)] motion-fast hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  style={{ backgroundColor: "var(--nba-cta)" }}
                >
                  Review Evidence
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 2 — WHY THIS MATTERS */}
        <Column label="Why this matters" index={1}>
          <span className="text-white/85">
            {item ? "Potential revenue leakage" : "Awaiting evidence"}
          </span>
          <div
            className="mt-1.5 text-[19px] font-extrabold tracking-tight"
            style={{ color: item ? "var(--nba-exposure)" : "rgba(255,255,255,0.55)" }}
          >
            {exposure}
          </div>
          <div className="mt-1 text-[12px] font-medium text-white/60">
            {item
              ? item.exposure > 0
                ? "Estimated exposure"
                : "Exposure not quantified"
              : "No exposure computed"}
          </div>
        </Column>

        {/* 3 — EVIDENCE SUMMARY */}
        <Column label="Evidence summary" index={2}>
          <div className="flex items-center gap-x-4 whitespace-nowrap">
            <EvidenceStat icon={FileText} value={records} label={records === 1 ? "Record" : "Records"} />
            <EvidenceStat icon={Layers} value={sources} label={sources === 1 ? "Source" : "Sources"} />
            <EvidenceStat icon={GitCompareArrows} value={0} label="Conflicts" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.06em]"
              style={{ color: statusColor }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
              {statusLabel}
            </span>
            <ConfidenceChip tier={confidence} size={9} />
          </div>
          <div
            className="mt-2 h-[5px] w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--nba-track)" }}
            role="progressbar"
            aria-valuenow={verifyPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Verification progress"
          >
            <div
              className="h-full rounded-full motion-fast"
              style={{ width: `${verifyPct}%`, backgroundColor: statusColor }}
            />
          </div>
        </Column>

        {/* 4 — STATUS */}
        <Column label="Status" index={3}>
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"
            style={{ color: statusColor }}
          >
            <ClipboardCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="min-w-0">{statusLabel}</span>
          </span>
          <div className="mt-1.5 text-[12.5px] font-medium text-white/70">
            {item?.approved ? "Officer approved" : "Awaiting document validation"}
          </div>
        </Column>

        {/* 5 — ASSIGNED TO */}
        <Column label="Assigned to" index={4}>
          <span className="inline-flex items-center gap-2">
            <User
              className="h-4 w-4 shrink-0"
              strokeWidth={1.9}
              style={{ color: "var(--nba-operational)" }}
            />
            <span className="text-[13px] font-semibold text-white/90">You</span>
          </span>
        </Column>

        {/* 6 — DUE IN */}
        <Column label="Due in" index={5}>
          <span className="inline-flex items-center gap-2">
            <Clock
              className="h-4 w-4 shrink-0"
              strokeWidth={1.9}
              style={{ color: dueIn === "Overdue" ? "var(--nba-exposure)" : "var(--nba-operational)" }}
            />
            <span
              className="text-[13px] font-semibold"
              style={{
                color: dueIn === "Overdue" ? "var(--nba-exposure)" : "rgba(255,255,255,0.9)",
              }}
            >
              {dueIn ?? "—"}
            </span>
          </span>
        </Column>
      </div>
    </section>
  );
}
