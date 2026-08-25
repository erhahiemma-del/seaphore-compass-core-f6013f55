/**
 * Next Best Action — the strongest decision surface on Mission Control.
 *
 * Presentation only. It renders the highest-priority item the existing
 * `projectTodaysPriorities` projection produced; it does not re-rank, score
 * or invent anything.
 *
 * Persistent geometry: the six-column banner is never removed or collapsed
 * because data is missing. Missing values render as neutral placeholders
 * ("—", 0, "Awaiting evidence") inside the same slots, so the same component
 * populates automatically when live analysis produces a value.
 */
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

function Column({
  label,
  children,
  className,
  divider = true,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-5",
        divider && "border-l border-[color:var(--nba-divider)]",
        className,
      )}
    >
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

  const badge = item ? `${item.priority} priority` : projection.stateLabel;
  const title = item ? item.entityName : "Awaiting evidence";
  const description = item ? item.rationale : projection.stateDetail;
  const confidence = item?.confidence ?? "unconfirmed";
  const verifyPct = VERIFY_PCT[confidence] ?? 12;
  const records = items.length;

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
      <div className="relative grid items-stretch gap-y-5 py-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,0.55fr)_minmax(0,0.5fr)]">
        {/* 1 — NEXT BEST ACTION */}
        <div className="min-w-0 px-5">
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
        <Column label="Why this matters">
          <span className="text-white/85">
            {item ? "Potential revenue leakage" : "Awaiting evidence"}
          </span>
          <div
            className="mt-1.5 text-[19px] font-extrabold tracking-tight"
            style={{ color: item ? "var(--nba-exposure)" : "rgba(255,255,255,0.55)" }}
          >
            —
          </div>
          <div className="mt-1 text-[12px] font-medium text-white/60">
            {item ? "Exposure not quantified" : "No exposure computed"}
          </div>
        </Column>

        {/* 3 — EVIDENCE SUMMARY */}
        <Column label="Evidence summary">
          <div className="flex items-center gap-x-4 whitespace-nowrap">
            <EvidenceStat icon={FileText} value={records} label={records === 1 ? "Record" : "Records"} />
            <EvidenceStat icon={Layers} value={projection.uipId ? 1 : 0} label="Sources" />
            <EvidenceStat icon={GitCompareArrows} value={0} label="Conflicts" />
          </div>
          <div className="mt-3 flex items-center gap-2 whitespace-nowrap">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em]"
              style={{ color: "var(--nba-verify)" }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--nba-verify)" }}
              />
              Verification Required
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
              className="h-full rounded-full"
              style={{ width: `${verifyPct}%`, backgroundColor: "var(--nba-verify)" }}
            />
          </div>
        </Column>

        {/* 4 — STATUS */}
        <Column label="Status">
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"
            style={{ color: "var(--nba-verify)" }}
          >
            <ClipboardCheck className="h-4 w-4" strokeWidth={2} />
            Verification Required
          </span>
          <div className="mt-1.5 text-[12.5px] font-medium text-white/70">
            {item?.approved ? "Officer approved" : "Awaiting document validation"}
          </div>
        </Column>

        {/* 5 — ASSIGNED TO */}
        <Column label="Assigned to">
          <span className="inline-flex items-center gap-2">
            <User
              className="h-4 w-4"
              strokeWidth={1.9}
              style={{ color: "var(--nba-operational)" }}
            />
            <span className="text-[13px] font-semibold text-white/90">You</span>
          </span>
        </Column>

        {/* 6 — DUE IN */}
        <Column label="Due in">
          <span className="inline-flex items-center gap-2">
            <Clock
              className="h-4 w-4"
              strokeWidth={1.9}
              style={{ color: "var(--nba-operational)" }}
            />
            <span className="text-[13px] font-semibold text-white/90">—</span>
          </span>
        </Column>
      </div>
    </section>
  );
}
