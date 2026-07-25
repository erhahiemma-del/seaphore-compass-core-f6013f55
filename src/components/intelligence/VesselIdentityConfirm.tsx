/**
 * VesselIdentityConfirm — officer confirmation surface.
 *
 * Renders the top-ranked GFW candidate with its Identity Confidence
 * Score, the signal breakdown that produced the score, and every
 * alternate the ranker considered. The officer picks the correct
 * vessel or cancels. Nothing is auto-published to OSAE while this
 * component is on-screen.
 *
 * OC-001 compliant: every number wears a chip. Footer per rule.
 */
import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Flag, Radio, ShipIcon, Hash } from "lucide-react";
import type { GfwCandidate, GfwVesselIdentity } from "@/connectors/global-fishing-watch/types";
import type {
  IdentityConfidenceResult,
  IdentityConfidenceTier,
} from "@/intelligence/matching/identity-confidence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TIER_TO_HEX: Record<IdentityConfidenceTier, { fg: string; bg: string; label: string }> = {
  VERIFIED: { fg: "#1E6B3A", bg: "rgba(30,107,58,0.10)", label: "VERIFIED" },
  OBSERVED: { fg: "#2563EB", bg: "rgba(37,99,235,0.10)", label: "OBSERVED" },
  INFERRED: { fg: "#B06A00", bg: "rgba(176,106,0,0.10)", label: "INFERRED" },
  UNCONFIRMED: { fg: "#8A98A6", bg: "rgba(138,152,166,0.14)", label: "UNCONFIRMED" },
};

export interface VesselIdentityConfirmProps {
  query: string;
  ambiguityReason: "none" | "below-threshold" | "tied-candidates" | "no-candidates";
  candidates: GfwCandidate[];
  onConfirm: (vessel: GfwVesselIdentity) => void;
  onCancel?: () => void;
  className?: string;
}

function ScoreChip({ score, tier }: { score: number; tier: IdentityConfidenceTier }) {
  const t = TIER_TO_HEX[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: t.fg, backgroundColor: t.bg }}
      title={`Identity Confidence: ${t.label}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.fg }} />
      {t.label} · {score}/100
    </span>
  );
}

function SignalBreakdown({ confidence }: { confidence: IdentityConfidenceResult }) {
  const positives = confidence.signals.filter((s) => s.contribution > 0 || s.kind === "provider-match-fields" || s.weight === 0);
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {positives.map((s, i) => (
        <li key={`${s.kind}-${i}`} className="flex items-start gap-2 text-[12px] leading-snug">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
          <span className="flex-1 text-foreground/90">
            <span className="font-medium">{s.label}</span>
            {s.weight > 0 && (
              <span className="ml-1 text-muted-foreground">
                {s.contribution}/{s.weight} pts
              </span>
            )}
            <span className="ml-1 text-muted-foreground">— {s.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function CandidateRow({
  candidate,
  isTop,
  onSelect,
}: {
  candidate: GfwCandidate;
  isTop: boolean;
  onSelect: (v: GfwVesselIdentity) => void;
}) {
  const [open, setOpen] = useState(isTop);
  const v = candidate.vessel;
  return (
    <li
      className={cn(
        "rounded-md border bg-card p-3",
        isTop ? "border-primary/50 shadow-sm" : "border-border/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <ShipIcon className="h-4 w-4 text-primary/80" />
          <span className="text-sm font-medium">{v.name ?? "(unnamed vessel)"}</span>
          {isTop && <Badge variant="secondary" className="ml-1 text-[10px]">Top match</Badge>}
        </button>
        <ScoreChip score={candidate.confidence.score} tier={candidate.confidence.tier} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {v.imo && <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />IMO {v.imo}</span>}
        {v.mmsi && <span className="inline-flex items-center gap-1"><Radio className="h-3 w-3" />MMSI {v.mmsi}</span>}
        {v.callSign && <span>Call sign {v.callSign}</span>}
        {v.flag && <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3" />{v.flag}</span>}
        {v.providerMatchFields && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            provider: {v.providerMatchFields}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[11px] font-medium text-muted-foreground">Why this score</p>
          <SignalBreakdown confidence={candidate.confidence} />
          {(v.aliases?.length || v.historicalNames?.length) ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {v.aliases?.length ? <>Aliases: {v.aliases.join(", ")}. </> : null}
              {v.historicalNames?.length ? <>Prior names: {v.historicalNames.join(", ")}.</> : null}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => onSelect(v)}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Confirm this vessel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function VesselIdentityConfirm({
  query,
  ambiguityReason,
  candidates,
  onConfirm,
  onCancel,
  className,
}: VesselIdentityConfirmProps) {
  if (candidates.length === 0) {
    return (
      <div className={cn("rounded-md border border-border/60 bg-card p-4", className)}>
        <p className="text-sm font-medium">No candidate vessels for &ldquo;{query}&rdquo;.</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Refine the query with an IMO, MMSI, or call sign.
        </p>
      </div>
    );
  }

  const reasonText =
    ambiguityReason === "tied-candidates"
      ? "Two candidates are within the tie band."
      : ambiguityReason === "below-threshold"
        ? "Top match is below the auto-select threshold."
        : ambiguityReason === "no-candidates"
          ? "No candidates."
          : "Multiple candidates were considered.";

  return (
    <section
      aria-label="Confirm intended vessel"
      className={cn("rounded-md border border-primary/40 bg-primary/5 p-4", className)}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-primary">
            Officer confirmation required
          </p>
          <h3 className="mt-0.5 text-sm font-semibold">
            Confirm intended vessel for &ldquo;{query}&rdquo;
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {reasonText} Evidence will not be published to OSAE until you confirm.
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </header>

      <ul className="flex flex-col gap-2">
        {candidates.map((c, i) => (
          <CandidateRow key={c.vessel.vesselId} candidate={c} isTop={i === 0} onSelect={onConfirm} />
        ))}
      </ul>

      <footer className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </footer>
    </section>
  );
}
