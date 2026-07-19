/**
 * HR-2 / HR-5 — VERIFIED confidence is only permitted when the data is
 * traced to a named, authoritative source. This registry is the whitelist.
 *
 * Add a new source here (with owner + refresh cadence) before using
 * `tier="verified"` anywhere in the app.
 */

export interface AuthoritativeSource {
  id: string;
  name: string;
  owner: string;
  jurisdiction?: string;
  category: "sanctions" | "vessel" | "corporate" | "customs" | "audit";
  /** Human description of refresh cadence, e.g. "Daily 04:00 UTC". */
  refresh: string;
}

export const AUTHORITATIVE_SOURCES: readonly AuthoritativeSource[] = [
  {
    id: "ofac-sdn",
    name: "OFAC SDN List",
    owner: "US Treasury OFAC",
    category: "sanctions",
    refresh: "Daily",
  },
  {
    id: "un-sc",
    name: "UN Security Council Consolidated List",
    owner: "United Nations",
    category: "sanctions",
    refresh: "On publication",
  },
  {
    id: "eu-sanc",
    name: "EU Consolidated Sanctions List",
    owner: "European Union",
    category: "sanctions",
    refresh: "Daily",
  },
  {
    id: "uk-hmt",
    name: "UK HMT Sanctions List",
    owner: "HM Treasury OFSI",
    category: "sanctions",
    refresh: "Daily",
  },
  {
    id: "imo-gisis",
    name: "IMO GISIS",
    owner: "International Maritime Organization",
    category: "vessel",
    refresh: "Weekly",
  },
  {
    id: "cac-ng",
    name: "Nigeria CAC Registry",
    owner: "Corporate Affairs Commission (NG)",
    jurisdiction: "NG",
    category: "corporate",
    refresh: "Daily",
  },
  {
    id: "audit-int",
    name: "Confirmed Internal Audit",
    owner: "Seaphore Compliance",
    category: "audit",
    refresh: "Per audit cycle",
  },
] as const;

const SOURCE_IDS = new Set(AUTHORITATIVE_SOURCES.map((s) => s.id));

export function isAuthoritativeSource(id: string): boolean {
  return SOURCE_IDS.has(id);
}

export function getAuthoritativeSource(id: string): AuthoritativeSource | undefined {
  return AUTHORITATIVE_SOURCES.find((s) => s.id === id);
}

/**
 * HR-2 gate. Throws when `tier === "verified"` without a whitelisted source.
 * Called by <Metric> and <SanctionsMatch>.
 */
export function assertVerifiedSource(
  tier: string,
  sourceId: string | undefined,
  context: string,
): void {
  if (tier !== "verified") return;
  if (!sourceId || !isAuthoritativeSource(sourceId)) {
    throw new Error(
      `[HR-2] ${context}: tier="verified" requires an authoritative source. ` +
        `Got source="${sourceId ?? "<none>"}". Register the source in ` +
        `src/lib/compliance/authoritative-sources.ts or downgrade the tier.`,
    );
  }
}

/**
 * HR-5 gate — hard-sanctions data cannot ship as INFERRED.
 */
export function assertSanctionsTier(
  tier: string,
  sourceId: string | undefined,
  context: string,
): void {
  if (tier === "inferred" || tier === "unconfirmed") {
    throw new Error(
      `[HR-5] ${context}: sanctions/watchlist matches cannot be "${tier}". ` +
        `Match against an authoritative list or do not surface it.`,
    );
  }
  if (tier === "verified") assertVerifiedSource(tier, sourceId, context);
}
