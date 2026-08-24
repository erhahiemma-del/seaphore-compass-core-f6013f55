/**
 * Provider rows, assembled from every registry.
 *
 * Lives apart from the page component so the page stays a pure component
 * module (fast refresh) and so this mapping — the point where a provider
 * could silently be shown as live — is unit-testable on its own.
 */
import { aisProviderRegistry } from "@/services/eo";
import { listVesselSources } from "@/services/geospatial";
import { governmentRegistry } from "@/services/government";

/** Operational availability. Deliberately not the certification vocabulary. */
export type Availability =
  | "ACTIVE"
  | "AWAITING_CREDENTIALS"
  | "PENDING_INTEGRATION"
  | "UNAVAILABLE";

export interface ProviderRow {
  readonly id: string;
  readonly name: string;
  readonly capabilities: string;
  readonly availability: Availability;
  /** Why it is not active. Required for everything but ACTIVE. */
  readonly reason: string | null;
  readonly requires: string | null;
  readonly authentication: string;
  readonly provenance: string;
}

/**
 * Assemble rows from every registry.
 *
 * Exported for testing: the mapping from each registry's own status
 * vocabulary into one availability scale is where a provider could
 * silently be shown as live.
 */
export function collectProviders(): readonly ProviderRow[] {
  const rows: ProviderRow[] = [];

  // ── Map vessel sources ────────────────────────────────────────
  for (const source of listVesselSources()) {
    const descriptor = source.describe();
    rows.push({
      id: descriptor.id,
      name: descriptor.label,
      capabilities: descriptor.description,
      // A registered map source is implemented and reachable; whether it
      // returns data depends on credentials it reads server-side, which
      // this page cannot see. It is listed as active because it is wired
      // into the live map, with its caveat carried through.
      availability: "ACTIVE",
      reason: descriptor.caveat ?? null,
      requires: null,
      authentication: "Server-side",
      provenance: "VesselProvenance per observation",
    });
  }

  // ── AIS history providers ─────────────────────────────────────
  for (const entry of aisProviderRegistry.list()) {
    rows.push({
      id: entry.providerId,
      name: entry.displayName,
      capabilities: "Historical AIS positions for SAR correlation and gap detection.",
      availability:
        entry.status === "CONNECTED"
          ? "ACTIVE"
          : entry.status === "PENDING_CREDENTIALS"
            ? "AWAITING_CREDENTIALS"
            : "UNAVAILABLE",
      reason: entry.blockers[0] ?? null,
      requires: entry.credentialEnv.join(", ") || null,
      authentication: entry.status === "CONNECTED" ? "Server-side" : "Not provisioned",
      provenance: "Per-report source id",
    });
  }

  // ── Government sources ────────────────────────────────────────
  for (const source of governmentRegistry.list()) {
    rows.push({
      id: source.sourceId,
      name: `${source.agency} — ${source.systemName}`,
      capabilities: source.datasets.map((dataset) => dataset.name).join(" · "),
      availability: governmentAvailability(source.status, source.license.reviewRequired),
      reason: source.notes[0] ?? null,
      requires: source.integrationMethod.join(" → "),
      authentication: source.authentication ?? "None",
      provenance: source.officialUrl,
    });
  }

  return rows;
}

function governmentAvailability(status: string, licenceUnread: boolean): Availability {
  if (status === "API_CONNECTED" || status === "EXPORT_CONNECTED") {
    // Technically connected but commercially unresolved is not active.
    return licenceUnread ? "PENDING_INTEGRATION" : "ACTIVE";
  }
  if (status === "AUTHORIZATION_REQUIRED" || status === "CREDENTIALS_REQUIRED") {
    return "AWAITING_CREDENTIALS";
  }
  if (status === "NOT_AVAILABLE" || status === "DEPRECATED") return "UNAVAILABLE";
  return "PENDING_INTEGRATION";
}
