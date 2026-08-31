/**
 * Cesium Ion activation — administrator credential modal.
 *
 * The token is typed here and posted straight to an authenticated,
 * admin-gated server function. It is never written to local storage, put
 * in a URL, logged, or held in a module-level variable, and the modal
 * only ever reads back a four-character hint — enough to recognise a
 * credential, not enough to reuse it.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

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
import { activateCesiumIonToken, type CesiumIonStatus } from "@/lib/cesium-ion.functions";

export interface CesiumTokenModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Current credential state, for recognition without disclosure. */
  readonly status: CesiumIonStatus | null;
  /** Called after a token is accepted upstream and stored. */
  readonly onActivated?: () => void;
}

export function CesiumTokenModal({
  open,
  onOpenChange,
  status,
  onActivated,
}: CesiumTokenModalProps) {
  const activate = useServerFn(activateCesiumIonToken);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    setAccount(null);
    try {
      const result = (await activate({ data: { token: token.trim() } })) as {
        ok: boolean;
        account: string | null;
        message: string | null;
      };
      if (!result.ok) {
        setError(result.message ?? "The token was not accepted by Cesium Ion.");
        return;
      }
      setAccount(result.account);
      setToken("");
      onActivated?.();
    } catch {
      setError("The token could not be activated from this session.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden />
            Activate Cesium Ion
          </DialogTitle>
          <DialogDescription>
            The 3D Terrain Perspective renders Seaphore&apos;s canonical vessels, ports and findings
            over Cesium Ion terrain. Paste an Ion access token to activate it. The token is
            validated with Ion before it is stored and is only ever released to an authenticated
            officer session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {status?.configured ? (
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
                Credential present ({status.origin === "environment"
                  ? "environment"
                  : "activated"}{" "}
                · ends {status.hint ?? "—"})
                {status.validatedAt ? ` · last checked ${status.validatedAt.slice(0, 16)}Z` : null}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden />
                No credential configured — the 3D view is unavailable, not empty.
              </span>
            )}
          </div>

          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Cesium Ion access token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            aria-label="Cesium Ion access token"
          />

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {account ? (
            <p className="text-xs text-success">
              Token validated against Ion account {account} and activated.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Close
          </Button>
          <Button onClick={() => void submit()} disabled={pending || token.trim().length < 20}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Validate and activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
