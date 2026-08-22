/**
 * Executive Intelligence Brief.
 *
 * Renders `ExecutiveBriefV2`. Decision-first: an officer sees what
 * happened, why it matters, how strong the evidence is, and what to do —
 * and nothing else until they ask.
 *
 * ## Progressive disclosure is the design, not a nicety
 *
 * Everything below the recommended action is collapsed by default:
 * evidence, the full finding list, unknowns, counter-hypotheses. An
 * officer deciding in under a minute cannot read a data dump, and a brief
 * that shows everything at once is a dashboard wearing a brief's name.
 *
 * ## What it never does
 *
 * It computes nothing. Priority is OSAE's, confidence bands are
 * `reasoning`'s, evidence grade is the OSINT engine's, freshness is
 * recomputed by the brief builder. This component orders and hides.
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DECISION_LABEL,
  OFFICER_DECISIONS,
  type ExecutiveBriefV2,
  type OfficerDecisionKind,
  type SummaryLine,
} from "@/services/orchestration";
import type { IntelligenceFinding } from "@/services/intelligence";

/**
 * What an officer can do with a brief.
 *
 * Re-exported from `services/orchestration` so the vocabulary has one
 * definition. The panel renders these; it does not decide what they are.
 */
export type BriefDecision = OfficerDecisionKind;

export interface ExecutiveBriefPanelProps {
  readonly brief: ExecutiveBriefV2;
  /** Findings behind the brief, for the evidence drill-down. */
  readonly findings?: readonly IntelligenceFinding[];
  readonly onDecision?: (decision: BriefDecision, brief: ExecutiveBriefV2) => void;
  /** Opens the full evidence viewer for one finding. */
  readonly onViewEvidence?: (findingId: string) => void;
  readonly className?: string;
}

const TONE_CLASS: Record<SummaryLine["tone"], string> = {
  critical: "text-rose-700",
  attention: "text-amber-700",
  neutral: "text-foreground",
};

export function ExecutiveBriefPanel({
  brief,
  findings = [],
  onDecision,
  onViewEvidence,
  className,
}: ExecutiveBriefPanelProps) {
  const headline = brief.keyFindings[0] ?? null;

  return (
    <section
      aria-label="Executive intelligence brief"
      data-testid="executive-brief"
      className={cn(
        "flex flex-col gap-4 rounded-md border border-border/60 bg-background p-4",
        className,
      )}
    >
      {/* ── WHAT HAPPENED ────────────────────────────────────── */}
      <header className="flex flex-col gap-1.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          What happened
        </h2>
        <ul className="flex flex-col gap-0.5">
          {brief.summary.map((line) => (
            <li key={line.text} className={cn("text-[13px]", TONE_CLASS[line.tone])}>
              {line.text}
            </li>
          ))}
        </ul>
      </header>

      {/* ── WHY IT MATTERS ───────────────────────────────────── */}
      {headline ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Why it matters
          </h2>
          <p className="text-[13px] text-foreground">{headline.statement}</p>
          <p className="text-[11.5px] text-muted-foreground">
            {headline.subject} · {headline.module} · observed {headline.age}
          </p>
        </div>
      ) : null}

      {/* ── CONFIDENCE ───────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Confidence
        </h2>
        <p className="text-[12.5px] text-foreground">
          {brief.confidence.supported} of {brief.confidence.attempted} modules reached a supported
          conclusion
          {brief.confidence.bands.length > 0
            ? `, at ${brief.confidence.bands.join(" and ")} confidence`
            : ""}
          .
        </p>
        {brief.evidence.totalRefs > 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            {brief.evidence.totalRefs} evidence {brief.evidence.totalRefs === 1 ? "item" : "items"}{" "}
            from {brief.evidence.providers.join(", ")} ·{" "}
            {brief.evidence.byGrade.map((g) => `${g.count} ${g.grade}`).join(", ")}
          </p>
        ) : (
          <p className="text-[11.5px] text-amber-700">
            No evidence supports this brief. Nothing below should be acted on as fact.
          </p>
        )}
      </div>

      {/* ── RECOMMENDED ACTION ───────────────────────────────── */}
      <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recommended action
        </h2>
        {brief.nextBestAction ? (
          <p className="text-[13px] font-medium text-foreground">{brief.nextBestAction.action}</p>
        ) : (
          // Offering an action when nothing warrants one teaches officers
          // to ignore the field.
          <p className="text-[12.5px] text-muted-foreground">
            No action is recommended. Nothing in this brief meets the threshold for one.
          </p>
        )}

        {onDecision ? (
          // Driven off the canonical list so a decision added in
          // `officer-decision.ts` cannot be missing a button here.
          <div className="mt-1 flex flex-wrap gap-1.5">
            {OFFICER_DECISIONS.map((decision, index) => (
              <DecisionButton
                key={decision}
                decision={decision}
                label={DECISION_LABEL[decision]}
                brief={brief}
                onDecision={onDecision}
                primary={index === 0}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* ── EVERYTHING ELSE, COLLAPSED ───────────────────────── */}
      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
        {brief.keyFindings.length > 0 ? (
          <Disclosure label={`All findings (${brief.keyFindings.length})`} testId="brief-findings">
            <ul className="flex flex-col gap-1.5">
              {brief.keyFindings.map((finding) => (
                <li key={finding.id} className="rounded border border-border/60 p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {finding.priority ? (
                      <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        {finding.priority}
                      </span>
                    ) : null}
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {finding.confidenceBand ?? "unassessed"} · {finding.freshness} ·{" "}
                      {finding.evidenceCount} evidence
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-foreground">{finding.statement}</p>
                  {onViewEvidence ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-6 px-0 text-[11px]"
                      onClick={() => onViewEvidence(finding.id)}
                    >
                      View evidence
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {brief.counterHypotheses.length > 0 ? (
          <Disclosure
            label={`What would refute this (${brief.counterHypotheses.length})`}
            testId="brief-counter"
          >
            <ul className="flex flex-col gap-1">
              {brief.counterHypotheses.map((item) => (
                <li key={item.findingId} className="flex gap-1.5 text-[12px]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                  <span className="text-muted-foreground">{item.statement}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {brief.unknowns.length > 0 ? (
          // Not buried below the fold by accident — collapsed, but always
          // present and always counted in the label.
          <Disclosure label={`Not established (${brief.unknowns.length})`} testId="brief-unknowns">
            <ul className="flex flex-col gap-1">
              {brief.unknowns.map((unknown) => (
                <li key={unknown} className="flex gap-1.5 text-[12px]">
                  <ShieldQuestion
                    className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="text-muted-foreground">{unknown}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {findings.length > 0 ? (
          <p className="text-[10px] text-muted-foreground">
            {findings.length} finding{findings.length === 1 ? "" : "s"} evaluated ·{" "}
            {brief.producedAt.slice(0, 16).replace("T", " ")}Z
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DecisionButton({
  decision,
  label,
  brief,
  onDecision,
  primary,
}: {
  decision: BriefDecision;
  label: string;
  brief: ExecutiveBriefV2;
  onDecision: (decision: BriefDecision, brief: ExecutiveBriefV2) => void;
  primary?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      className="h-7 text-[11px]"
      onClick={() => onDecision(decision, brief)}
    >
      {label}
    </Button>
  );
}

/** Collapsed by default. The officer opens what they need. */
function Disclosure({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        {label}
      </button>
      {open ? <div className="pb-2 pl-4">{children}</div> : null}
    </div>
  );
}
