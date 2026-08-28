/**
 * CONNECT OPENSANCTIONS — secure credential modal.
 *
 * The key is held in component state only for the duration of the
 * submit, sent once over the authenticated server-function boundary, and
 * cleared. It is never written to localStorage, sessionStorage, a URL,
 * a log line, or an audit record, and never rendered unmasked unless the
 * officer explicitly reveals their own input.
 */
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rotateOpenSanctionsCredential } from "@/lib/opensanctions.functions";

export type ConnectPhase = "IDLE" | "CONNECTING" | "VALIDATING" | "CONNECTED" | "FAILED";

const PHASE_LABEL: Record<ConnectPhase, string> = {
  IDLE: "",
  CONNECTING: "CONNECTING",
  VALIDATING: "VALIDATING",
  CONNECTED: "CONNECTED",
  FAILED: "CONNECTION FAILED",
};

export function ConnectOpenSanctionsDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [phase, setPhase] = useState<ConnectPhase>("IDLE");
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "CONNECTING" || phase === "VALIDATING";

  function reset() {
    setApiKey("");
    setReveal(false);
    setPhase("IDLE");
    setError(null);
  }

  async function submit() {
    setError(null);
    setPhase("CONNECTING");
    try {
      setPhase("VALIDATING");
      const result = await rotateOpenSanctionsCredential({ data: { apiKey } });
      setApiKey(""); // clear key material immediately
      if (result.replaced && result.validation.authenticated) {
        setPhase("CONNECTED");
        onConnected?.();
        return;
      }
      setPhase("FAILED");
      setError(
        result.validation.error ??
          "OpenSanctions did not accept this credential. The existing credential was kept.",
      );
    } catch (err) {
      setApiKey("");
      setPhase("FAILED");
      setError(err instanceof Error ? err.message : "Connection attempt failed.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-[0.08em] uppercase">
            Connect OpenSanctions
          </DialogTitle>
          <DialogDescription className="text-xs">
            Credential management is restricted to authorised administrators.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label htmlFor="os-api-key" className="text-xs font-medium">
            OpenSanctions API Key
          </Label>
          <div className="relative">
            <Input
              id="os-api-key"
              type={reveal ? "text" : "password"}
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              disabled={busy || phase === "CONNECTED"}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••••••••••"
              className="pr-10 font-mono text-xs"
            />
            <button
              type="button"
              aria-label={reveal ? "Hide API key" : "Show API key"}
              onClick={() => setReveal((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <p className="flex items-start gap-2 rounded-md border border-line bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your API key is stored server-side and is never exposed to the browser.
          </p>

          {phase !== "IDLE" && (
            <div
              className={
                phase === "FAILED"
                  ? "flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive"
                  : "flex items-center gap-2 rounded-md border border-line p-2 text-[11px] text-muted-foreground"
              }
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {phase === "FAILED" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="font-semibold tracking-[0.08em]">{PHASE_LABEL[phase]}</span>
              {error && <span className="font-normal">— {error}</span>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={busy || apiKey.trim().length < 8} onClick={submit}>
            Connect Securely
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
