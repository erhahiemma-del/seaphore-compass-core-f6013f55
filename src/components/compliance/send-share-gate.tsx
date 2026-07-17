import { useState, type ReactNode } from "react";

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
import { OfficerAccountabilityNotice } from "./officer-accountability-notice";
import {
  requireOfficerAuthorization,
  type OfficerAuthorization,
} from "@/lib/compliance/officer-authorization";

/**
 * HR-8 — Send & Share Brief always requires an explicit officer action.
 * The system never sends automatically. This gate is the *only* sanctioned
 * path to any share/send server function.
 */
export interface SendShareGateProps {
  trigger?: ReactNode;
  officer: { id: string; name: string; role: string };
  intent: string;
  target: string;
  onAuthorized: (auth: OfficerAuthorization) => Promise<void> | void;
}

export function SendShareGate({
  trigger,
  officer,
  intent,
  target,
  onAuthorized,
}: SendShareGateProps) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="default">Send &amp; Share Brief</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Authorize send</DialogTitle>
          <DialogDescription>
            Confirm this action. The system never sends automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-surface-2 p-3">
            <div className="type-small text-slate">Intent</div>
            <div className="type-body">{intent}</div>
            <div className="type-small text-slate mt-2">Recipient</div>
            <div className="type-body font-mono">{target}</div>
            <div className="type-small text-slate mt-2">Officer</div>
            <div className="type-body">
              {officer.name} · <span className="text-slate">{officer.role}</span>
            </div>
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
