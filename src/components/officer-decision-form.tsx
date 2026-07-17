import { useEffect, useState } from "react";
import { Lock, Paperclip } from "lucide-react";

import { cn } from "@/lib/utils";

const DECISION_OPTIONS = [
  "Approve Clearance",
  "Hold – Delay",
  "Request More Information",
  "Escalate",
  "Deny Entry – Clearance",
] as const;
export type DecisionOption = (typeof DECISION_OPTIONS)[number];

/**
 * DS-5 / DS-6 / DS-7 Officer Decision form + Authentication + submit.
 * DS-8 accountability disclaimer is rendered below.
 */
export function OfficerDecisionForm({
  officerName,
  officerRank,
  className,
  onSubmit,
  onSaveDraft,
}: {
  officerName: string;
  officerRank: string;
  className?: string;
  onSubmit?: (state: DecisionState) => void;
  onSaveDraft?: (state: DecisionState) => void;
}) {
  const [decision, setDecision] = useState<DecisionOption>("Approve Clearance");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const state: DecisionState = { decision, reason, notes, signature };

  return (
    <form
      className={cn("space-y-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(state);
      }}
    >
      <fieldset className="rounded-lg border border-line bg-card p-4 shadow-card">
        <legend className="px-1 type-label text-slate">Officer Decision</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {DECISION_OPTIONS.map((opt) => (
            <label
              key={opt}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[12px] font-semibold motion-fast",
                decision === opt
                  ? "border-[color:var(--color-teal)] bg-[color:var(--color-teal)]/5 text-foreground"
                  : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="decision"
                value={opt}
                checked={decision === opt}
                onChange={() => setDecision(opt)}
                className="accent-[color:var(--color-teal)]"
              />
              {opt}
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="type-label text-slate">Decision Reason</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Short reason for the decision"
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-teal)]"
            />
          </label>
          <label className="block">
            <span className="type-label text-slate">Decision Notes (max 2000)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              rows={5}
              placeholder="Officer notes, context, and rationale"
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-teal)]"
            />
            <span className="mt-0.5 block text-right text-[11px] text-slate">
              {notes.length}/2000
            </span>
          </label>
          <label className="block">
            <span className="type-label text-slate">Attachments</span>
            <div className="mt-1 flex items-center justify-center rounded-md border border-dashed border-line bg-surface-2/40 px-3 py-4 text-[12px] text-slate">
              <Paperclip className="mr-2 h-4 w-4" />
              Drop files here or click to upload evidence
              <input type="file" multiple className="hidden" />
            </div>
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-card p-4 shadow-card">
        <legend className="px-1 type-label text-slate">Officer Authentication</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="type-label text-slate">Digital Signature</span>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Type your full name to sign"
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-[color:var(--color-teal)]"
            />
          </label>
          <label>
            <span className="type-label text-slate">Name</span>
            <input
              type="text"
              readOnly
              value={officerName}
              className="mt-1 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px]"
            />
          </label>
          <label>
            <span className="type-label text-slate">Rank / Position</span>
            <input
              type="text"
              readOnly
              value={officerRank}
              className="mt-1 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px]"
            />
          </label>
          <label>
            <span className="type-label text-slate">Date &amp; Time (UTC)</span>
            <input
              type="text"
              readOnly
              value={now.toISOString().replace("T", " ").slice(0, 19) + " UTC"}
              className="mt-1 w-full rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-[13px]"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onSaveDraft?.(state)}
          className="rounded-md border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-foreground hover:bg-surface-2"
        >
          Save as Draft
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-navy)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90"
        >
          <Lock className="h-3.5 w-3.5" />
          Submit Decision
        </button>
        <span className="text-[11px] text-slate">
          Your decision will be recorded and cannot be changed.
        </span>
      </div>
    </form>
  );
}

export interface DecisionState {
  decision: DecisionOption;
  reason: string;
  notes: string;
  signature: string;
}
