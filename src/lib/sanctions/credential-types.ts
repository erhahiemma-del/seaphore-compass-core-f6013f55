/**
 * Client-safe credential status shapes for the OpenSanctions connection
 * panel. Presence and timestamps only — never key material.
 */
export type CredentialSource = "platform-secret" | "credential-store" | "none";

export interface CredentialStatus {
  readonly configured: boolean;
  readonly source: CredentialSource;
  readonly rotatedAt: string | null;
  readonly lastValidatedAt: string | null;
}

export interface ValidationOutcome {
  readonly authenticated: boolean;
  readonly checkedAt: string;
  readonly httpStatus: number | null;
  readonly error: string | null;
}
