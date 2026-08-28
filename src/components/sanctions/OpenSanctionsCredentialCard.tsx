/**
 * OPEN SANCTIONS — credential + connection status panel (admin only).
 *
 * Shows presence and validation state, never the secret or any fragment
 * of it. "Connected" is only shown after a successful provider response.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectOpenSanctionsDialog } from "@/components/sanctions/ConnectOpenSanctionsDialog";
import {
  getOpenSanctionsCredentialStatus,
  testOpenSanctionsConnection,
} from "@/lib/opensanctions.functions";
import type { CredentialStatus, ValidationOutcome } from "@/lib/server/opensanctions.server";

type Phase = "UNKNOWN" | "CHECKING" | "CONNECTED" | "FAILED" | "NOT_CONFIGURED";

function formatTs(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Never" : d.toUTCString().replace("GMT", "UTC");
}

export function OpenSanctionsCredentialCard() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("UNKNOWN");
  const [outcome, setOutcome] = useState<ValidationOutcome | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [denied, setDenied] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const next = await getOpenSanctionsCredentialStatus();
      setStatus(next);
      setPhase(next.configured ? "UNKNOWN" : "NOT_CONFIGURED");
    } catch {
      setDenied(true);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function test() {
    setPhase("CHECKING");
    try {
      const result = await testOpenSanctionsConnection();
      setOutcome(result);
      setPhase(result.authenticated ? "CONNECTED" : "FAILED");
      void loadStatus();
    } catch (err) {
      setOutcome({
        authenticated: false,
        checkedAt: new Date().toISOString(),
        httpStatus: null,
        error: err instanceof Error ? err.message : "Connection test failed.",
      });
      setPhase("FAILED");
    }
  }

  if (denied) return null;

  const dot =
    phase === "CONNECTED"
      ? "bg-emerald-500"
      : phase === "FAILED" || phase === "NOT_CONFIGURED"
        ? "bg-destructive"
        : "bg-muted-foreground";

  const stateLabel =
    phase === "CONNECTED"
      ? "Connected"
      : phase === "CHECKING"
        ? "Validating…"
        : phase === "FAILED"
          ? "Connection failed"
          : phase === "NOT_CONFIGURED"
            ? "Not configured"
            : "Credential configured — not yet verified this session";

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold tracking-[0.1em] uppercase">Open Sanctions</h3>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
            <span>{stateLabel}</span>
          </p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Last checked: </dt>
              <dd className="inline">
                {formatTs(outcome?.checkedAt ?? status?.lastValidatedAt ?? null)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Key rotated: </dt>
              <dd className="inline">{formatTs(status?.rotatedAt ?? null)}</dd>
            </div>
          </dl>
          {phase === "FAILED" && outcome?.error && (
            <p className="mt-2 text-[11px] text-destructive">{outcome.error}</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Key stored server-side only; never shown, not even
            partially.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={test} disabled={phase === "CHECKING"}>
            {phase === "CHECKING" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="mr-1.5 h-3.5 w-3.5" />
            )}
            Test Connection
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {status?.configured ? "Replace Key" : "Connect"}
          </Button>
        </div>
      </div>

      <ConnectOpenSanctionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={() => {
          void loadStatus();
          void test();
        }}
      />
    </section>
  );
}
