/**
 * HR-8 — Share/Send operations require an explicit officer action.
 * `requireOfficerAuthorization` is the single client-side gate every Send &
 * Share Brief button must pass through before invoking any share server fn.
 */

export interface OfficerAuthorization {
  officerId: string;
  officerName: string;
  role: string;
  intent: string; // human summary of what is being sent
  target: string; // recipient / channel
  acknowledgedAt: string; // ISO 8601 UTC
  acknowledgedOath: true; // officer confirmed the accountability notice
}

export function requireOfficerAuthorization(
  auth: Partial<OfficerAuthorization> | null | undefined,
): asserts auth is OfficerAuthorization {
  if (
    !auth ||
    !auth.officerId ||
    !auth.officerName ||
    !auth.role ||
    !auth.intent ||
    !auth.target ||
    !auth.acknowledgedAt ||
    auth.acknowledgedOath !== true
  ) {
    throw new Error(
      "[HR-8] Share/Send requires an explicit officer authorization. " +
        "Route the action through <SendShareGate>.",
    );
  }
}
