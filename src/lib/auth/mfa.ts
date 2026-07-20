/**
 * MFA helpers — thin wrappers around supabase.auth.mfa (TOTP factor).
 *
 * SECURITY NOTES
 *  - Supabase enforces MFA server-side. The client only surfaces the
 *    challenge/verify UI; a stolen access token without an AAL2 upgrade
 *    still cannot access MFA-required resources when RLS policies check
 *    `auth.jwt() ->> 'aal' = 'aal2'`.
 *  - Never store TOTP secrets in application state beyond the enroll
 *    screen. The QR code is displayed once and immediately discarded.
 *  - Verification codes are one-time; do not log them.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MfaEnrollResult {
  factorId: string;
  qrCode: string; // data URL — render once, never persist
  secret: string; // manual entry fallback
}

export async function enrollTotp(friendlyName = "Seaphore TOTP"): Promise<MfaEnrollResult> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function verifyEnrollment(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
}

export async function unenroll(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/**
 * Detect whether the current session needs an MFA step-up (aal1 -> aal2).
 * Returns the first verified TOTP factor to challenge, or null.
 */
export async function getPendingMfaFactor(): Promise<{ id: string; friendlyName: string } | null> {
  const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalErr) return null;
  if (aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") return null;
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  const factor = data.totp.find((f) => f.status === "verified");
  return factor ? { id: factor.id, friendlyName: factor.friendly_name ?? "TOTP" } : null;
}

export async function challengeAndVerify(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
}
