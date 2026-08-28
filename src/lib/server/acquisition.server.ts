/**
 * ─────────────────────────────────────────────────────────────────────
 *  Server-side evidence acquisition bridge
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Authenticated Evidence Providers (OpenSanctions, Global Fishing Watch,
 *  Copernicus) resolve their credentials from `process.env`, which only
 *  exists on the server. Any officer surface that ran acquisition in the
 *  browser therefore saw those providers as "Credentials Missing" even
 *  when the runtime secrets were correctly configured.
 *
 *  This module runs the EXISTING pipelines (IAL ConnectorManager,
 *  SANCTIONS capability, ICE) inside the server boundary. It adds no
 *  registry, no cache and no new orchestration: it is a boundary shim so
 *  the front end receives real provider evidence instead of an
 *  unauthenticated empty package.
 * ─────────────────────────────────────────────────────────────────────
 */
import { getIntelligenceAcquisitionManager } from "@/services/ial";
import { runSanctionsScreening } from "@/services/capabilities/sanctions";
import type { SanctionsScreeningTarget } from "@/services/capabilities/sanctions";
import { runIce } from "@/services/ice";
import type { IceQueryInput, IntelligencePackage } from "@/services/ice/types";
import { screenEntity } from "@/lib/server/opensanctions.server";
import type { SanctionsScreeningFinding } from "@/lib/sanctions/match-state";

/** Officer-facing sanctions screening outcome (transport-safe shape). */
export interface ServerSanctionsScreening {
  readonly providers: ReadonlyArray<string>;
  readonly hitCount: number;
  readonly findings: ReadonlyArray<{
    readonly field: string;
    readonly value: string;
    readonly sourceName: string | null;
    readonly confidence: string | null;
    readonly observedAt: string | null;
  }>;
  /**
   * Normalized screening finding from the provider's screening endpoint
   * (POST /match/{dataset}). Distinct from free-text search evidence: a
   * score is similarity, never a confirmed sanction.
   */
  readonly finding: SanctionsScreeningFinding;
}

export async function screenSanctionsOnServer(
  target: SanctionsScreeningTarget,
): Promise<ServerSanctionsScreening> {
  const [result, finding] = await Promise.all([
    runSanctionsScreening({ target }),
    screenEntity({ name: target.name, kind: target.kind, imo: target.imo }),
  ]);
  const verified = result.package.verified.filter((v) => v.kind === "sanctions");
  return {
    finding,
    providers: result.providers.map((p) => p.displayName),
    hitCount: verified.length,
    findings: verified.slice(0, 50).map((v) => {
      const rec = v as unknown as Record<string, unknown>;
      const str = (key: string): string | null => {
        const raw = rec[key];
        return typeof raw === "string" && raw.length > 0 ? raw : null;
      };
      return {
        field: str("field") ?? "sanctions",
        value: str("value") ?? str("label") ?? "",
        sourceName: str("sourceName") ?? str("source"),
        confidence: str("confidence"),
        observedAt: str("observedAt") ?? str("collectedAt"),
      };
    }),
  };
}

/** Run the full ICE correlation on the server, with live credentials. */
export async function runIceOnServer(input: IceQueryInput): Promise<IntelligencePackage> {
  const manager = getIntelligenceAcquisitionManager();
  return runIce(input, manager);
}
