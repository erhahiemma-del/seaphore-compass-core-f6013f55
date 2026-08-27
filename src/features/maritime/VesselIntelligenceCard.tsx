/**
 * Maritime — Vessel Intelligence Card.
 *
 * Opens when an officer selects a vessel. Shows what is actually known and is
 * explicit about what is not.
 *
 * Design rule: every field renders. A field with no data shows "Not available"
 * with the reason, rather than being hidden — an officer must be able to tell
 * "this vessel has no registered owner on file" apart from "we forgot to
 * display the owner". Nothing here invents a value.
 */
import { ExternalLink, ShieldCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RISK_COLORS, riskColor, type Vessel } from "@/services/geospatial";

import { VesselImageHeader } from "./VesselImageHeader";
import {
  destinationLabel,
  operationalStateLabel,
  positionFreshnessLabel,
  positionProvenanceLabel,
  riskBadgeLabel,
  trackAvailability,
} from "./vessel-panel-state";

export interface VesselIntelligenceCardProps {
  readonly vessel: Vessel;
  readonly onClose: () => void;
  /** Optional navigation hooks. Absent handlers disable their button. */
  readonly onOpenInvestigation?: (imo: string) => void;
  readonly onOpenEntity?: (imo: string) => void;
  readonly onOpenTimeline?: (imo: string) => void;
  readonly onOpenCopilot?: (imo: string) => void;
  /** Whether the active source can answer questions about this vessel's past. */
  readonly sourceSupportsHistory?: boolean;
}

export function VesselIntelligenceCard({
  vessel,
  onClose,
  onOpenInvestigation,
  onOpenEntity,
  onOpenTimeline,
  onOpenCopilot,
  sourceSupportsHistory = false,
}: VesselIntelligenceCardProps) {
  const { identity, position } = vessel;
  const color = riskColor(vessel.riskLevel);
  const track = trackAvailability(sourceSupportsHistory);

  return (
    <aside
      aria-label={`Intelligence for ${identity.name}`}
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card"
    >
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{identity.name}</h2>
          <p className="font-mono text-xs text-muted-foreground">IMO {identity.imo}</p>
        </div>
        {/*
          The badge names its own axis.

          It rendered `riskLevel` alone, so an unassessed vessel showed a
          bare `UNKNOWN` beside its name and the officer had to guess what
          was unknown — identity, position, or intent. One word removes
          the guess.
        */}
        <Badge
          variant="outline"
          style={{ color, borderColor: color }}
          className="shrink-0 whitespace-nowrap text-[10px]"
        >
          {riskBadgeLabel(vessel)}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close intelligence card"
          className="h-6 w-6 shrink-0"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/*
          The picture first, because an officer identifies a ship by
          looking at it faster than by reading a table. What it is
          entitled to claim is stated on it, so a class reference can
          never be mistaken for a photograph of this hull.
        */}
        <VesselImageHeader identity={identity} />

        {/*
          One line for the thing an officer checks first.

          There is no alert model yet, so the honest answer is that
          nothing is outstanding — stated rather than left blank. A blank
          space where an alert would go reads as "not loaded"; a sentence
          reads as "checked, nothing there", and the strip is already the
          right shape to carry a real alert when one exists.
        */}
        <div
          data-testid="vessel-operational-state"
          className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-[11.5px] font-medium text-foreground">
            {operationalStateLabel()}
          </span>
        </div>

        <div className="space-y-3.5 px-4 py-3">
          {/*
            Identity first and compact: the fields that answer "which ship
            is this", on one row each, with the type and flag beside the
            numbers rather than below them.
          */}
          <Section title="Identity">
            <Field label="IMO" value={identity.imo} mono />
            <Field
              label="MMSI"
              value={identity.mmsi}
              mono
              reason="Not in current position report"
            />
            <Field
              label="Call sign"
              value={identity.callSign}
              mono
              reason="Not in current position report"
            />
            <Field label="Flag" value={identity.flag} reason="Requires vessel registry lookup" />
            <Field label="Type" value={identity.type} reason="Not classified" />
          </Section>

          {/*
            The operational snapshot — where it is, how it is moving, and
            how much the position is worth. Provenance and freshness sit
            beside the coordinates rather than in a separate section,
            because a position without them is a number an officer cannot
            weigh.
          */}
          <Section title="Position">
            <Field
              label="Coordinates"
              value={`${position.lat.toFixed(4)}°, ${position.lon.toFixed(4)}°`}
              mono
            />
            <Field label="Speed" value={`${position.speed.toFixed(1)} kn`} mono />
            <Field
              label="Heading"
              value={
                position.headingReported === false ? undefined : `${Math.round(position.heading)}°`
              }
              mono
              reason="Course not reported"
            />
            <Field label="Source" value={positionProvenanceLabel(vessel)} />
            <Field label="Freshness" value={positionFreshnessLabel(vessel)} />
            <Field label="Received" value={formatTimestamp(position.timestamp)} mono />
          </Section>

          {/*
            Voyage as the source gave it. The destination is printed
            verbatim and never geocoded — expanding a LOCODE into a place
            or a map marker would be Seaphore adding a claim to a voyage
            it did not observe.
          */}
          <Section title="Voyage">
            <Field
              label="Destination"
              value={destinationLabel(vessel).value}
              reason={destinationLabel(vessel).reason}
            />
            <Field
              label="ETA"
              value={position.etaHours != null ? `${position.etaHours} h` : undefined}
              reason="Not reported by the source"
            />
            <Field
              label="Movement history"
              value={track.state === "SUPPORTED" ? "Available" : undefined}
              reason={track.note}
            />
          </Section>

          <Section title="Intelligence">
            <Field label="Risk" value={riskBadgeLabel(vessel)} />
            <Field
              label="Attention score"
              value={vessel.attentionScore > 0 ? String(vessel.attentionScore) : undefined}
              reason="Not ranked"
            />
            <Field label="Owner" value={undefined} reason="Awaiting ownership intelligence" />
            <Field label="Operator" value={undefined} reason="Awaiting ownership intelligence" />
          </Section>
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
        <ActionButton
          label="Investigation"
          onClick={onOpenInvestigation && (() => onOpenInvestigation(identity.imo))}
        />
        <ActionButton label="Entity" onClick={onOpenEntity && (() => onOpenEntity(identity.imo))} />
        <ActionButton
          label="Timeline"
          onClick={onOpenTimeline && (() => onOpenTimeline(identity.imo))}
        />
        <ActionButton
          label="Copilot"
          onClick={onOpenCopilot && (() => onOpenCopilot(identity.imo))}
        />
      </footer>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value?: string;
  readonly mono?: boolean;
  /** Shown in place of the value when it is absent. */
  readonly reason?: string;
}

function Field({ label, value, mono, reason }: FieldProps) {
  const available = value !== undefined && value !== null && value !== "";
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={[
          "min-w-0 truncate text-right",
          mono && available ? "font-mono" : "",
          available ? "text-foreground" : "italic text-muted-foreground/70",
        ]
          .filter(Boolean)
          .join(" ")}
        title={available ? value : reason}
      >
        {available ? value : (reason ?? "Not available")}
      </dd>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!onClick}
      onClick={onClick}
      title={onClick ? undefined : `${label} is not wired up yet`}
      className="h-7 justify-start gap-1.5 text-xs"
    >
      <ExternalLink className="h-3 w-3" aria-hidden />
      {label}
    </Button>
  );
}

/** Format an ISO timestamp with relative age, or say it is unreadable. */
function formatTimestamp(iso: string): string | undefined {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return undefined;
  const minutes = Math.round((Date.now() - parsed) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Palette re-export guard — keeps the card honest about using shared colours. */
export const CARD_RISK_COLORS = RISK_COLORS;
