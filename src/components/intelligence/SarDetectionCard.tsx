/**
 * SarDetectionCard
 *
 * One SAR detection as an officer sees it: what the sensor saw, when it
 * saw it, how old that is, and who it might be — as candidates, never as
 * an identity.
 *
 * ## Two things this component refuses to do
 *
 * It never renders a single vessel name as the detection's identity. Even
 * a `matched` correlation shows the candidate with its confidence and the
 * evidence behind it, because the match is a hypothesis about two
 * observations and an officer must be able to disagree with it.
 *
 * It never shows a position without its age. Sentinel-1 revisits an area
 * every few days; a detection rendered like a live AIS position would be
 * read as "there now", and it never means that.
 */
import { AlertTriangle, Radar, Satellite, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  describeDataAge,
  dataAgeMs,
  type AisMatchStatus,
  type CandidateIdentity,
  type MaritimeEvent,
  type MaritimeEventType,
} from "@/services/eo";

const EVENT_LABEL: Record<MaritimeEventType, string> = {
  AIS_GAP: "AIS Gap",
  SAR_DETECTION: "SAR Detection",
  UNMATCHED_SAR: "Unmatched SAR",
  POTENTIAL_DARK_CONTACT: "Potential Dark Contact",
  HIGH_CONFIDENCE_DARK_CONTACT: "High-Confidence Dark Contact",
};

const EVENT_TONE: Record<MaritimeEventType, string> = {
  HIGH_CONFIDENCE_DARK_CONTACT: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  POTENTIAL_DARK_CONTACT: "border-orange-500/40 bg-orange-500/10 text-orange-700",
  UNMATCHED_SAR: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  AIS_GAP: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  SAR_DETECTION: "border-slate-500/40 bg-slate-500/10 text-slate-700",
};

const MATCH_LABEL: Record<AisMatchStatus, string> = {
  matched: "AIS matched",
  ambiguous: "AIS ambiguous",
  unmatched: "No AIS match",
  "no-ais-coverage": "No AIS coverage",
};

const MATCH_TONE: Record<AisMatchStatus, string> = {
  matched: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  ambiguous: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  unmatched: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  // Deliberately neutral: absence of coverage is a fact about us, not a
  // finding about the vessel, and colouring it as an alert would read as
  // an accusation.
  "no-ais-coverage": "border-slate-500/40 bg-slate-500/10 text-slate-700",
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone,
      )}
    >
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-[12px] text-foreground">{children}</span>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateIdentity }) {
  return (
    <li className="rounded-md border border-border/60 bg-muted/10 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-foreground">
          {candidate.name ?? `MMSI ${candidate.mmsi}`}
        </span>
        <Chip tone="border-border/70 bg-muted/40 text-muted-foreground">{candidate.grade}</Chip>
        <span className="text-[11px] text-muted-foreground">
          {pct(candidate.confidence)} correlation confidence
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="MMSI">{candidate.mmsi}</Field>
        <Field label="IMO">{candidate.imo ?? "—"}</Field>
        <Field label="Separation">{candidate.distanceM} m</Field>
        <Field label="AIS age at pass">{candidate.timeDeltaSec} s</Field>
      </div>

      {candidate.positionExtrapolated && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          AIS position was dead-reckoned to the acquisition time — the separation above is against
          an estimated position, not a reported one.
        </p>
      )}

      {/* Signed contributions, so what argued against the match is as
          visible as what argued for it. */}
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {candidate.evidence.map((item) => (
          <li key={item.factor} className="flex gap-1.5 text-[11px]">
            <span
              className={cn(
                "shrink-0 font-mono font-semibold",
                item.contribution < 0 ? "text-rose-600" : "text-emerald-700",
              )}
            >
              {item.contribution > 0 ? "+" : ""}
              {item.contribution.toFixed(2)}
            </span>
            <span className="text-muted-foreground">{item.detail}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export interface SarDetectionCardProps {
  event: MaritimeEvent;
  /** Injected so the rendered age is deterministic in tests. */
  now?: number;
  className?: string;
}

export function SarDetectionCard({ event, now = Date.now(), className }: SarDetectionCardProps) {
  const { detection, correlation, aisGap } = event;
  // Recomputed at render. A cached age makes a six-day-old pass look current.
  const age = describeDataAge(dataAgeMs(event.occurredAt, now));

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border/60 bg-background p-4",
        className,
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {detection ? (
            <Radar className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
          )}
          <Chip tone={EVENT_TONE[event.type]}>{EVENT_LABEL[event.type]}</Chip>
          {correlation && (
            <Chip tone={MATCH_TONE[correlation.status]}>{MATCH_LABEL[correlation.status]}</Chip>
          )}
          {/* Age sits in the header, not a footnote: it qualifies
              everything else on the card. */}
          <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {age}
          </span>
        </div>

        <p className="text-[13px] font-medium text-foreground">{event.statement}</p>
        <p className="text-[12px] text-muted-foreground">{event.classificationRationale}</p>
      </header>

      {detection && (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Satellite className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sensor
            </span>
            <span className="text-[12px] text-foreground">
              {detection.sensor} · snapshot at acquisition, not a live position
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Acquired">
              {new Date(detection.acquiredAt).toISOString().slice(0, 16).replace("T", " ")}Z
            </Field>
            <Field label="Detection confidence">{pct(detection.detectionConfidence)}</Field>
            <Field label="Position">
              {detection.position.latitude.toFixed(4)}, {detection.position.longitude.toFixed(4)}
            </Field>
            <Field label="Position ± ">{detection.positionUncertaintyM} m</Field>
            <Field label="Length">
              {detection.estimatedLengthM ? `${Math.round(detection.estimatedLengthM)} m` : "—"}
            </Field>
            <Field label="Heading axis">
              {detection.estimatedHeadingDeg !== null
                ? `${Math.round(detection.estimatedHeadingDeg)}° ±180°`
                : "—"}
            </Field>
            <Field label="Scene">{detection.sceneId}</Field>
            <Field label="Model">
              {detection.detector.modelId} v{detection.detector.modelVersion}
            </Field>
          </div>
        </div>
      )}

      {correlation && correlation.candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Candidate identities ({correlation.candidates.length})
          </span>
          {/* The card's central claim: these are hypotheses. */}
          <p className="text-[11px] text-muted-foreground">
            Ranked hypotheses, not identifications. A SAR return carries no name, IMO or MMSI — each
            candidate below is a correlation between the radar detection and a separate AIS track.
          </p>
          <ul className="flex flex-col gap-2">
            {correlation.candidates.map((candidate) => (
              <CandidateRow key={candidate.mmsi} candidate={candidate} />
            ))}
          </ul>
        </div>
      )}

      {correlation?.status === "no-ais-coverage" && (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">
            No AIS was available for this area and time, so this detection can be neither matched
            nor excluded. This is a gap in collection, not an observation about the vessel.
          </p>
        </div>
      )}

      {aisGap && (
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:grid-cols-4">
          <Field label="Gap vessel">{aisGap.name ?? aisGap.mmsi}</Field>
          <Field label="Silent for">{Math.round(aisGap.durationSec / 3600)} h</Field>
          <Field label="Last report">
            {new Date(aisGap.lastReportAt).toISOString().slice(0, 16).replace("T", " ")}Z
          </Field>
          <Field label="AIS source">{aisGap.source}</Field>
        </div>
      )}

      {event.promotionRequires.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            What would strengthen this
          </span>
          <ul className="flex flex-col gap-0.5">
            {event.promotionRequires.map((item) => (
              <li key={item} className="text-[12px] text-muted-foreground">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {correlation && (
        <div className="flex flex-wrap items-center gap-x-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{correlation.aisReportsConsidered} AIS tracks considered</span>
          <span>·</span>
          <span>{Math.round(correlation.searchRadiusM)} m search radius</span>
          {detection && (
            <>
              <span>·</span>
              <span>Detector {detection.detector.serviceId}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
