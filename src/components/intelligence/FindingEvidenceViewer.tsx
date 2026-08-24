/**
 * FindingEvidenceViewer
 *
 * Renders one `IntelligenceFinding` in full: the statement, and everything
 * needed to challenge it.
 *
 * ## Why this is not IntelligenceEvidenceViewer
 *
 * That component lists `IntelligenceEvidenceItem`s and reduces each to a
 * single confidence chip. This one renders the Phase 3 finding model, whose
 * whole purpose is that the confidences are *not* one number:
 *
 *   Evidence grade         how good the source is       AUDITED … OBSERVED
 *   Observation confidence how sure the analyzer is     0–1
 *   Assessment confidence  how sure the conclusion is   high … insufficient
 *
 * Rendering them in one chip would collapse the distinction the model exists
 * to preserve, so each is labelled with the question it answers. A
 * CORROBORATED source beside a `low` assessment is a correct display, not a
 * contradiction.
 *
 * The component computes nothing except freshness, which is recomputed from
 * `ageMs` because age changes with the clock and a cached band would make a
 * stale finding look fresh.
 */
import { AlertTriangle, CircleSlash, FileSearch, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  freshnessBandForAge,
  freshnessColor,
  freshnessLabel,
  formatAge,
} from "@/services/geospatial";
import type { OperationalPriority } from "@/services/osae";
import type { ConfidenceBand } from "@/services/reasoning/types";
import type { EvidenceRef, IntelligenceFinding } from "@/services/intelligence";
import type { OsintConfidenceLevel } from "@/lib/osint/types";

/** OSAE's vocabulary. Nothing else assigns these, so nothing else colours them. */
const PRIORITY_TONE: Record<OperationalPriority, string> = {
  urgent: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  act: "border-orange-500/40 bg-orange-500/10 text-orange-700",
  monitor: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  watch: "border-slate-500/40 bg-slate-500/10 text-slate-700",
};

/** `reasoning`'s band vocabulary — four values, distinct from the six below. */
const BAND_TONE: Record<ConfidenceBand, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  medium: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  low: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  insufficient: "border-slate-500/40 bg-slate-500/10 text-slate-700",
};

/** The OSINT engine's six-value evidence grade. Never mixed with the above. */
const GRADE_TONE: Record<OsintConfidenceLevel, string> = {
  AUDITED: "border-emerald-600/40 bg-emerald-600/10 text-emerald-800",
  VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  CORROBORATED: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  INFERRED: "border-violet-500/40 bg-violet-500/10 text-violet-700",
  DECLARED: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  OBSERVED: "border-slate-500/40 bg-slate-500/10 text-slate-700",
};

const STATUS_LABEL: Record<IntelligenceFinding["status"], string> = {
  supported: "Supported",
  "insufficient-evidence": "Insufficient evidence",
  "pending-source": "Awaiting data source",
  "not-applicable": "Not applicable",
};

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

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

/** A label naming the question a value answers, so two scales never blur. */
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

export interface FindingEvidenceViewerProps {
  finding: IntelligenceFinding;
  className?: string;
}

export function FindingEvidenceViewer({ finding, className }: FindingEvidenceViewerProps) {
  const { assessment, dataQuality, provenance } = finding;
  // Recomputed, never read from the finding — see the header note.
  const freshness = freshnessBandForAge(dataQuality.ageMs);

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-md border border-border/60 bg-background p-4",
        className,
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <Chip tone="border-border/70 bg-muted/40 text-muted-foreground">{finding.module}</Chip>
          <Chip tone="border-border/70 bg-muted/40 text-muted-foreground">
            {STATUS_LABEL[finding.status]}
          </Chip>
          {finding.priority && (
            <Chip tone={PRIORITY_TONE[finding.priority]}>{finding.priority}</Chip>
          )}
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: freshnessColor(freshness) }}
            title={formatAge(dataQuality.ageMs)}
          >
            {freshnessLabel(freshness)}
          </span>
        </div>

        <p className="text-[13px] font-medium text-foreground">{finding.statement}</p>

        {finding.priority && finding.priorityRationale && (
          // Attributed explicitly: the priority is OSAE's judgement, not this
          // component's, and not the module's.
          <p className="text-[12px] text-muted-foreground">
            <span className="font-semibold">OSAE:</span> {finding.priorityRationale}
          </p>
        )}
      </header>

      {finding.unavailableReason && (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">{finding.unavailableReason}</p>
        </div>
      )}

      {assessment && (
        <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Assessment confidence
            </span>
            <Chip tone={BAND_TONE[assessment.band]}>{assessment.band}</Chip>
            <span className="text-[12px] text-muted-foreground">
              {pct(assessment.confidence)} — how sure the conclusion is, not the source
            </span>
          </div>

          {/* The ladder, shown in full: confidence decays with each inferential
              step, and hiding that would make the final number look firmer
              than it is. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["Evidence", assessment.propagation.evidence],
                ["Relationship", assessment.propagation.relationship],
                ["Pattern", assessment.propagation.pattern],
                ["Assessment", assessment.propagation.assessment],
                ["Recommendation", assessment.propagation.recommendation],
              ] as const
            ).map(([label, value]) => (
              <Field key={label} label={label}>
                {pct(value)}
              </Field>
            ))}
          </div>

          {assessment.whyChain.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {assessment.whyChain.map((step) => (
                <li key={step.step} className="flex gap-2 text-[12px]">
                  <span className="shrink-0 font-semibold text-muted-foreground">{step.step}.</span>
                  <span className="text-foreground">
                    {step.statement}
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pct(step.confidence)} · {step.evidenceIds.length} ref
                      {step.evidenceIds.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {assessment.counterHypothesis ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  What would refute this
                </span>
                <p className="text-[12px] text-foreground">
                  {assessment.counterHypothesis.statement}
                </p>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {pct(assessment.counterHypothesis.likelihood)} of the evidence argues this way ·{" "}
                  {assessment.counterHypothesis.refutingEvidenceIds.length} ref
                  {assessment.counterHypothesis.refutingEvidenceIds.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ) : (
            // A confident claim must be falsifiable. If one reaches the UI
            // without a counter-hypothesis, say so rather than render it as
            // if it were sound.
            (assessment.band === "high" || assessment.band === "medium") && (
              <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                <p className="text-[12px] text-rose-700">
                  A {assessment.band}-confidence assessment reached this view without stating what
                  would refute it. Treat it as unverified.
                </p>
              </div>
            )
          )}
        </div>
      )}

      {finding.evidence.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence ({finding.evidence.length})
          </span>
          <ul className="flex flex-col gap-2">
            {finding.evidence.map((ref) => (
              <EvidenceRow key={ref.id} evidence={ref} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Validation">{dataQuality.validation}</Field>
          <Field label="Age">{formatAge(dataQuality.ageMs)}</Field>
          <Field label="Observed">{formatTs(finding.observedAt)}</Field>
          <Field label="Produced">{formatTs(finding.producedAt)}</Field>
        </div>

        {dataQuality.gaps.length > 0 && (
          // Absences are shown at the same weight as the content. An officer
          // who cannot see what is missing cannot judge what is present.
          <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Not covered: {dataQuality.gaps.join("; ")}.</span>
          </div>
        )}

        {provenance.pipeline.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline
            </span>
            {provenance.pipeline.map((stage) => (
              <Chip
                key={stage.contributorId}
                tone="border-border/70 bg-muted/40 text-muted-foreground"
              >
                {stage.stage}
              </Chip>
            ))}
          </div>
        )}

        {provenance.corroboration && (
          <p className="text-[12px] text-muted-foreground">
            Corroborated across {provenance.corroboration.sourceCount} source
            {provenance.corroboration.sourceCount === 1 ? "" : "s"}
            {provenance.corroboration.conflictFields.length > 0 &&
              ` — disagreeing on ${provenance.corroboration.conflictFields.join(", ")}`}
            .
          </p>
        )}
      </div>
    </section>
  );
}

function EvidenceRow({ evidence }: { evidence: EvidenceRef }) {
  const { provenance } = evidence;
  return (
    <li className="rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={GRADE_TONE[evidence.grade]}>{evidence.grade}</Chip>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          evidence grade — how good the source is
        </span>
        <Chip tone="border-border/70 bg-muted/40 text-muted-foreground">{evidence.type}</Chip>
      </div>

      <p className="mt-1.5 text-[12px] text-foreground">{evidence.summary}</p>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Observation confidence">{pct(evidence.observationConfidence)}</Field>
        <Field label="Source">{provenance.provider}</Field>
        <Field label="Dataset">{provenance.datasetId ?? "—"}</Field>
        <Field label="Observed">{formatTs(evidence.observedAt)}</Field>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Connector {provenance.source}</span>
        <span>·</span>
        <span>Retrieved {formatTs(provenance.retrievedAt)}</span>
        <span>·</span>
        <span title={evidence.payloadRef}>Record {evidence.payloadRef}</span>
      </div>
    </li>
  );
}
