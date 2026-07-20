/**
 * MfaChallenge — TOTP step-up challenge form.
 *
 * Shown after a successful password sign-in when the account has a
 * verified TOTP factor and the session is still at `aal1`. On success
 * Supabase upgrades the session to `aal2` and RLS policies keyed on
 * `auth.jwt() ->> 'aal' = 'aal2'` become satisfiable.
 *
 * SECURITY: the code is one-time. Never log or persist it. On failure
 * we surface a neutral error to avoid leaking factor state.
 */
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { challengeAndVerify } from "@/lib/auth/mfa";

export interface MfaChallengeProps {
  factorId: string;
  factorName?: string;
  onVerified: () => void;
  onCancel?: () => void;
}

export function MfaChallenge({ factorId, factorName, onVerified, onCancel }: MfaChallengeProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await challengeAndVerify(factorId, code.trim());
      onVerified();
    } catch {
      // Neutral message — do not disclose whether the factor or code was wrong.
      setError("Verification failed. Enter a fresh 6-digit code from your authenticator.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby="mfa-heading">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 id="mfa-heading" className="text-base font-semibold text-foreground">
            Two-factor verification
          </h3>
          <p className="text-xs text-muted-foreground">
            Enter the 6-digit code from {factorName ?? "your authenticator app"}.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mfa-code">Authentication code</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="123456"
          className="h-11 text-center text-lg tracking-[0.5em]"
          aria-describedby={error ? "mfa-error" : undefined}
          aria-invalid={!!error}
        />
      </div>

      {error ? (
        <p id="mfa-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={submitting || code.length !== 6}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Verify
        </Button>
      </div>
    </form>
  );
}
