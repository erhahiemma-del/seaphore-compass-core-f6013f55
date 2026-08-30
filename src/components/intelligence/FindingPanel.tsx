/**
 * The finding panel — one place an officer reads a finding and rules on it.
 *
 * It answers the six questions an officer actually asks, in that order:
 * what happened, why it matters, about whom, from where, how sure, and
 * what is expected of me. Nothing here computes any of those answers; the
 * persisted record already committed to them.
 *
 * ## Words this surface will not say
 *
 * Not "sanctioned", not "fraud", not "guilty". A confirmation confirms an
 * observation; it never upgrades a similarity score into a criminal
 * claim. A dismissal keeps the evidence and records a reason.
 *
 * ## Both decisions are gated, for different reasons
 *
 * Confirming is a record with the officer's name on it, so it asks once
 * more before writing. Dismissing removes an item from everyone else's
 * queue, so it cannot proceed without a reason from a fixed list.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, ShieldQuestion, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FINDING_DISMISSAL_LABEL,
  FINDING_DISMISSAL_REASONS,
  FINDING_INDICATOR_COLOR,
  FINDING_INDICATOR_LABEL,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_CAVEAT,
  FINDING_STATUS_LABEL,
  dismissalIsComplete,
  indicatorClassFor,
  needsOfficer,
  type FindingDismissalReason,
  type PersistedFinding,
} from "@/services/findings/record";

export interface FindingPanelProps {
  readonly finding: PersistedFinding;
  readonly onClose: () => void;
  /** Opens the canonical subject context. Never a second selection path. */
  readonly onOpenSubject?: (finding: PersistedFinding) => void;
  readonly onConfirm: (finding: PersistedFinding) => Promise<void> | void;
  readonly onDismiss: (
    finding: PersistedFinding,
    reason: FindingDismissalReason,
    note: string,
  ) => Promise<void> | void;
  readonly onOpenInvestigation: (finding: PersistedFinding) => Promise<void> | void;
  readonly className?: string;
}

type Pending = "CONFIRM" | "DISMISS" | "INVESTIGATION" | null;

export function FindingPanel({
  finding,
  onClose,
  onOpenSubject,
  onConfirm,
  onDismiss,
  onOpenInvestigation,
  className,
}: FindingPanelProps) {
  const [mode, setMode] = useState<"VIEW" | "CONFIRM_GATE" | "DISMISS_FORM">("VIEW");
  const [reason, setReason] = useState<FindingDismissalReason | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const indicator = indicatorClassFor(finding);
  const colour = FINDING_INDICATOR_COLOR[indicator];

  const run = async (kind: Exclude<Pending, null>, work: () => Promise<void> | void) => {
    setPending(kind);
    setProblem(null);
    try {
      await work();
      setMode("VIEW");
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "That decision could not be recorded.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      data-testid="finding-panel"
      className={cn(
        "w-full max-w-md overflow-y-auto rounded-md border border-line/70 bg-surface p-4 text-[13px] shadow-lg",
        className,
      )}
      aria-label={`Finding: ${finding.description}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
              style={{ background: `${colour}22`, color: colour }}
            >
              {FINDING_INDICATOR_LABEL[indicator]}
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.06em] text-slate">
              {finding.findingType.replace(/_/g, " ")}
            </span>
          </div>
          <h2 className="mt-1 text-[14px] font-semibold text-foreground">{finding.description}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close finding"
          className="rounded p-1 text-slate hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <p className="mt-3 rounded border border-line/60 bg-surface-2/60 p-2 text-[12.5px] text-foreground/85">
        <span className="font-semibold text-foreground">Why this needs attention: </span>
        {finding.whyAttention}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <Field label="Subject">
          {onOpenSubject ? (
            <button
              type="button"
              onClick={() => onOpenSubject(finding)}
              className="text-left font-medium text-foreground underline decoration-dotted"
            >
              {finding.subjectName ?? finding.subjectId}
            </button>
          ) : (
            (finding.subjectName ?? finding.subjectId)
          )}
        </Field>
        <Field label="Subject id">{finding.subjectId}</Field>
        <Field label="Severity">{FINDING_SEVERITY_LABEL[finding.severity]}</Field>
        <Field label="Status">{FINDING_STATUS_LABEL[finding.status]}</Field>
        <Field label="Detected">{new Date(finding.detectedAt).toLocaleString()}</Field>
        <Field label="Source">{finding.source}</Field>
        <Field label="Confidence">{finding.confidence ?? "Not stated by the source"}</Field>
        <Field label="Data state">{finding.dataState ?? "Not stated by the source"}</Field>
        <Field label="Location">
          {finding.position
            ? `${finding.position.lat.toFixed(2)}°, ${finding.position.lng.toFixed(2)}°`
            : "No position on the finding record"}
        </Field>
        <Field label="Source record">{finding.sourceRecordId ?? "Not recorded"}</Field>
      </dl>

      <p className="mt-2 text-[11px] text-slate">{FINDING_STATUS_CAVEAT[finding.status]}</p>

      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
        Evidence
      </h3>
      {finding.evidenceRefs.length === 0 ? (
        <p className="mt-1 text-[12px] text-slate">
          No evidence item is attached to this finding record. That is a gap in collection, not a
          clear result.
        </p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {finding.evidenceRefs.map((item) => (
            <li
              key={item.ref}
              className="rounded border border-line/60 bg-surface-2/50 p-2 text-[12px]"
            >
              <div className="font-medium text-foreground">{item.label}</div>
              <div className="mt-0.5 text-[11px] text-slate">
                {item.source}
                {item.observedAt ? ` · ${new Date(item.observedAt).toLocaleString()}` : ""}
                {item.confidence ? ` · ${item.confidence}` : ""}
                {item.dataState ? ` · ${item.dataState}` : ""}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-slate">{item.ref}</div>
            </li>
          ))}
        </ul>
      )}

      <RelatedRecords finding={finding} />

      {finding.decisions.length > 0 ? (
        <>
          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
            Officer actions
          </h3>
          <ul className="mt-1 space-y-1 text-[12px]">
            {finding.decisions.map((decision) => (
              <li key={decision.id} className="rounded border border-line/60 p-2">
                <span className="font-semibold text-foreground">
                  {decision.decision.replace(/_/g, " ")}
                </span>
                <span className="text-slate">
                  {" "}
                  · {decision.previousStatus} → {decision.newStatus} ·{" "}
                  {new Date(decision.decidedAt).toLocaleString()}
                </span>
                {decision.reason ? (
                  <div className="text-[11.5px] text-foreground/80">
                    Reason:{" "}
                    {FINDING_DISMISSAL_LABEL[decision.reason as FindingDismissalReason] ??
                      decision.reason}
                  </div>
                ) : null}
                {decision.note ? (
                  <div className="text-[11.5px] text-foreground/70">Note: {decision.note}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {problem ? (
        <p className="mt-3 rounded border border-[#F87171]/50 bg-[#F87171]/10 p-2 text-[12px] text-[#F87171]">
          {problem}
        </p>
      ) : null}

      {mode === "VIEW" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="finding-confirm"
            disabled={!needsOfficer(finding) && finding.status === "CONFIRMED"}
            onClick={() => setMode("CONFIRM_GATE")}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="finding-dismiss"
            onClick={() => setMode("DISMISS_FORM")}
          >
            <ShieldQuestion className="mr-1.5 h-3.5 w-3.5" /> Dismiss
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="finding-open-investigation"
            disabled={pending === "INVESTIGATION"}
            onClick={() => void run("INVESTIGATION", () => onOpenInvestigation(finding))}
          >
            {pending === "INVESTIGATION" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSearch className="mr-1.5 h-3.5 w-3.5" />
            )}
            Open investigation
          </Button>
        </div>
      ) : null}

      {mode === "CONFIRM_GATE" ? (
        <div
          data-testid="finding-confirm-gate"
          className="mt-4 rounded border border-line/70 bg-surface-2/60 p-3"
        >
          <p className="text-[12.5px] text-foreground/85">
            Confirm this finding as described. This records that you accept the observation and
            names you in the audit trail. It is not a finding of wrongdoing.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              data-testid="finding-confirm-commit"
              disabled={pending === "CONFIRM"}
              onClick={() => void run("CONFIRM", () => onConfirm(finding))}
            >
              {pending === "CONFIRM" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Yes, confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("VIEW")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "DISMISS_FORM" ? (
        <div
          data-testid="finding-dismiss-form"
          className="mt-4 rounded border border-line/70 bg-surface-2/60 p-3"
        >
          <p className="flex items-start gap-1.5 text-[12.5px] text-foreground/85">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-[#FB923C]" />
            A dismissal needs a reason. The finding and its evidence are kept.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FINDING_DISMISSAL_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`dismiss-reason-${option}`}
                onClick={() => setReason(option)}
                className={cn(
                  "rounded border px-2 py-1 text-[11.5px]",
                  reason === option
                    ? "border-foreground/60 bg-surface text-foreground"
                    : "border-line/70 text-slate hover:text-foreground",
                )}
              >
                {FINDING_DISMISSAL_LABEL[option]}
              </button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Notes (required when the reason is Other)"
            className="mt-2 h-20 text-[12px]"
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              data-testid="finding-dismiss-commit"
              disabled={pending === "DISMISS"}
              onClick={() => {
                const check = dismissalIsComplete(reason, note);
                if (!check.ok || !reason) {
                  setProblem(check.problem ?? "A dismissal reason is required.");
                  return;
                }
                void run("DISMISS", () => onDismiss(finding, reason, note.trim()));
              }}
            >
              {pending === "DISMISS" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Record dismissal
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("VIEW")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] uppercase tracking-[0.06em] text-slate">{label}</dt>
      <dd className="truncate text-[12px] font-medium text-foreground">{children}</dd>
    </div>
  );
}

function RelatedRecords({ finding }: { finding: PersistedFinding }) {
  const groups: Array<[string, readonly string[] | undefined]> = [
    ["Vessels", finding.related.vesselImos],
    ["Ports", finding.related.portLocodes],
    ["Terminals", finding.related.terminals],
    ["Berths", finding.related.berths],
    ["Facilities", finding.related.facilities],
    ["Voyages", finding.related.voyageIds],
    ["Manifests", finding.related.manifestIds],
  ];
  const present = groups.filter(([, ids]) => ids && ids.length > 0);
  if (present.length === 0) return null;

  return (
    <>
      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">
        Related records
      </h3>
      <ul className="mt-1 space-y-1 text-[12px]">
        {present.map(([label, ids]) => (
          <li key={label}>
            <span className="text-slate">{label}: </span>
            <span className="font-medium text-foreground">{(ids ?? []).join(", ")}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
