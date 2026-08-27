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
import { ExternalLink, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RISK_COLORS, riskColor, type Vessel } from "@/services/geospatial";

import { VesselImageHeader } from "./VesselImageHeader";

export interface VesselIntelligenceCardProps {
  readonly vessel: Vessel;
  readonly onClose: () => void;
  /** Optional navigation hooks. Absent handlers disable their button. */
  readonly onOpenInvestigation?: (imo: string) => void;
  readonly onOpenEntity?: (imo: string) => void;
  readonly onOpenTimeline?: (imo: string) => void;
  readonly onOpenCopilot?: (imo: string) => void;
}

export function VesselIntelligenceCard({
  vessel,
  onClose,
  onOpenInvestigation,
  onOpenEntity,
  onOpenTimeline,
  onOpenCopilot,
}: VesselIntelligenceCardProps) {
  const { identity, position } = vessel;
  const color = riskColor(vessel.riskLevel);

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
        <Badge
          variant="outline"
          style={{ color, borderColor: color }}
          className="shrink-0 text-[10px]"
        >
          {vessel.riskLevel}
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

        <div className="space-y-4 px-4 py-3">
          <Section title="Identity">
            <Field label="Name" value={identity.name} />
            <Field label="IMO" value={identity.imo} mono />
            <Field label="MMSI" value={identity.mmsi} mono reason="Not in current AIS report" />
            <Field
              label="Call sign"
              value={identity.callSign}
              mono
              reason="Not in current AIS report"
            />
            <Field label="Flag" value={identity.flag} reason="Requires vessel registry lookup" />
            <Field label="Type" value={identity.type} reason="Not classified" />
          </Section>

          <Section title="Ownership">
            {/* Ownership resolution is an Intelligence Orchestrator concern and is
              not wired to the map in this sprint — say so rather than blank. */}
            <Field label="Owner" value={undefined} reason="Awaiting ownership intelligence" />
            <Field label="Operator" value={undefined} reason="Awaiting ownership intelligence" />
          </Section>

          <Section title="Position">
            <Field
              label="Coordinates"
              value={`${position.lat.toFixed(4)}°, ${position.lon.toFixed(4)}°`}
              mono
            />
            <Field label="Heading" value={`${Math.round(position.heading)}°`} mono />
            <Field label="Speed" value={`${position.speed.toFixed(1)} kn`} mono />
            <Field label="Destination" value={position.destination} reason="Not declared" />
            <Field
              label="ETA"
              value={position.etaHours != null ? `${position.etaHours} h` : undefined}
              reason="Not derivable"
            />
            <Field label="Last AIS" value={formatTimestamp(position.timestamp)} mono />
          </Section>

          <Section title="Assessment">
            <Field label="Risk" value={vessel.riskLevel} />
            <Field
              label="Attention score"
              value={vessel.attentionScore > 0 ? String(vessel.attentionScore) : undefined}
              reason="Not ranked by OSAE"
            />
            <Field
              label="Confidence"
              value={undefined}
              reason="Requires a resolved UIP for this vessel"
            />
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
