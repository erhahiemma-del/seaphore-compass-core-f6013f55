import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, MessageCircle, FileText, Package, ShieldCheck } from "lucide-react";
import { OfficerAccountabilityNotice } from "./officer-accountability-notice";
import {
  requireOfficerAuthorization,
  type OfficerAuthorization,
} from "@/lib/compliance/officer-authorization";

export interface ShareSummaryRecipient {
  id: string;
  name: string;
  domain: string;
  initials: string;
  tone: string;
}

export interface ShareSummary {
  briefTitle: string;
  output: string;
  deliveryMethod: string;
  classification: string;
  recipients: ShareSummaryRecipient[];
  externalEmails: string[];
}

/**
 * HR-8 — Send & Share Brief always requires an explicit officer action.
 * The system never sends automatically. This gate is the *only* sanctioned
 * path to any share/send server function.
 *
 * When `summary` is provided, the dialog first surfaces a recipient and
 * delivery-options summary so the officer can review before authorizing.
 */
export interface SendShareGateProps {
  trigger?: ReactNode;
  officer: { id: string; name: string; role: string };
  intent: string;
  target: string;
  onAuthorized: (auth: OfficerAuthorization) => Promise<void> | void;
  summary?: ShareSummary;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SendShareGate({
  trigger,
  officer,
  intent,
  target,
  onAuthorized,
  summary,
  open: controlledOpen,
  onOpenChange,
}: SendShareGateProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset acknowledgement when the dialog opens so stale consents cannot be reused.
  useEffect(() => {
    if (open) setAck(false);
  }, [open]);

  async function handleAuthorize() {
    const auth: OfficerAuthorization = {
      officerId: officer.id,
      officerName: officer.name,
      role: officer.role,
      intent,
      target,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedOath: true,
    };
    requireOfficerAuthorization(auth);
    setBusy(true);
    try {
      await onAuthorized(auth);
      setOpen(false);
      setAck(false);
    } finally {
      setBusy(false);
    }
  }

  const OutputIcon =
    summary?.output.includes("Word")
      ? FileText
      : summary?.output.includes("Pack")
        ? Package
        : summary?.deliveryMethod === "WhatsApp"
          ? MessageCircle
          : Mail;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm send &amp; share</DialogTitle>
          <DialogDescription>
            Review recipients and delivery options before authorizing. The system never sends automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {summary && (
            <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate">
                  Brief
                </div>
                <div className="text-[13px] font-semibold text-foreground">
                  {summary.briefTitle}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate">
                    Output
                  </div>
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <OutputIcon className="h-3.5 w-3.5 text-slate" />
                    {summary.output}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate">
                    Delivery
                  </div>
                  <div className="font-semibold text-foreground">{summary.deliveryMethod}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate">
                    Classification
                  </div>
                  <div
                    className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold"
                    style={{ color: "#C0392B", backgroundColor: "#C0392B14" }}
                  >
                    {summary.classification}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate">
                  Recipients ({summary.recipients.length + summary.externalEmails.length})
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {summary.recipients.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-1 text-[11px] font-semibold text-foreground"
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: r.tone }}
                      >
                        {r.initials}
                      </span>
                      {r.name}
                    </span>
                  ))}
                  {summary.externalEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-1 text-[11px] font-semibold text-foreground"
                    >
                      <Mail className="h-3 w-3 text-slate" />
                      {email}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!summary && (
            <div className="rounded-md border border-line bg-surface-2 p-3">
              <div className="type-small text-slate">Intent</div>
              <div className="type-body">{intent}</div>
              <div className="type-small text-slate mt-2">Recipient</div>
              <div className="type-body font-mono">{target}</div>
            </div>
          )}

          <div className="rounded-md border border-line bg-surface-2 p-3">
            <div className="type-small text-slate">Officer</div>
            <div className="type-body">
              {officer.name} · <span className="text-slate">{officer.role}</span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-line bg-[#1E6B3A]/5 p-3 text-[12px] text-foreground/90">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1E6B3A]" />
            <span>
              This action will be recorded in the immutable audit trail. Recipients will receive the
              briefing together with evidence, confidence tiers, and the officer signature block.
            </span>
          </div>

          <OfficerAccountabilityNotice />

          <label className="flex items-start gap-2">
            <Checkbox
              checked={ack}
              onCheckedChange={(v) => setAck(v === true)}
              aria-label="Acknowledge officer accountability"
            />
            <span className="type-body">
              I acknowledge I am responsible for this decision.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleAuthorize} disabled={!ack || busy}>
            {busy ? "Authorizing…" : "Authorize &amp; Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
