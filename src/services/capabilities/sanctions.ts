/**
 * SANCTIONS Capability — Sprint 1A.3.
 *
 * Additive extension: this module resolves the SANCTIONS capability
 * via `ConnectorManager.getByCapability("SANCTIONS")` and returns an
 * EvidencePackage assembled by the existing IAL pipeline. It does NOT
 * modify OIE, ICE, IAL internals, ConnectorManager, ConnectorRegistry,
 * Cache, Health, Event Bus, Knowledge Graph, or Playbooks.
 *
 * Orchestration flow:
 *   Officer → Mission Builder → Intent Detection → Capability Resolution
 *     → resolveCapability("SANCTIONS")                (this module)
 *     → registry.getByCapability("SANCTIONS")          (IAL, extension)
 *     → ConnectorManager.acquire(...)                  (existing)
 *     → EvidencePackage → ICE → OIE → Adaptive Briefing
 *
 * Providers are interchangeable: OpenSanctions today; OFAC, UN, EU, and
 * commercial watchlists tomorrow — no changes here or in orchestration.
 */
import {
  acquireEvidence,
  canonicalEntityId,
  getIntelligenceAcquisitionManager,
} from "@/services/ial";
import type {
  AcquisitionQuery,
  ConnectorId,
  EntityKind,
  EvidencePackage,
} from "@/services/ial";
import type { ConnectorManager } from "@/services/ial";

/**
 * Screening target — either a canonical entity reference or a
 * free-text name (which the SANCTIONS providers resolve internally).
 */
export interface SanctionsScreeningTarget {
  readonly kind?: EntityKind;
  readonly name: string;
  readonly imo?: string;
}

/** Officer intent that resolves to the SANCTIONS capability. */
export type SanctionsIntent = "SANCTION_SCREEN";

export interface SanctionsScreeningRequest {
  readonly target: SanctionsScreeningTarget;
  /** Optional injected manager (tests / non-default registries). */
  readonly manager?: ConnectorManager;
  /**
   * Sprint EP-01 — officer intent. `SANCTION_SCREEN` (the default for
   * this capability) acquires evidence through the Connector Registry.
   */
  readonly intent?: SanctionsIntent;
  /**
   * Sprint EP-01 — explicit provider hints (e.g. `["open-sanctions"]`).
   * When present, acquisition is narrowed to the hinted connectors that
   * are actually registered. Purely a selection filter — the acquisition
   * pipeline, fusion, and persistence remain unchanged.
   */
  readonly connectorHints?: ReadonlyArray<ConnectorId>;
}


export interface SanctionsScreeningResult {
  readonly capability: "SANCTIONS";
  readonly providers: ReadonlyArray<{ id: ConnectorId; displayName: string }>;
  readonly package: EvidencePackage;
  readonly followUps: ReadonlyArray<string>;
}

/**
 * Deterministic follow-up prompts surfaced after every sanctions
 * briefing. Owned by the capability, not by any specific provider.
 */
export const SANCTIONS_FOLLOW_UPS: ReadonlyArray<string> = [
  "Explain why.",
  "Show evidence.",
  "Show sanction lists.",
  "Screen beneficial owner.",
  "Generate compliance report.",
  "Compare previous screening.",
];

function buildQuery(target: SanctionsScreeningTarget): AcquisitionQuery {
  const kind: EntityKind = target.kind ?? inferKindFromName(target.name);
  const nativeId = target.imo ?? target.name;
  return {
    entity: {
      kind,
      id: canonicalEntityId(kind, nativeId),
      label: target.name,
    },
    text: target.name,
    kinds: ["sanctions"],
  };
}

function inferKindFromName(name: string): EntityKind {
  if (/\bMV\b|\bM\/V\b|\bIMO\s*\d{7}\b/i.test(name)) return "vessel";
  return "company";
}

/**
 * Resolve the SANCTIONS capability into a set of connectors, then run
 * the standard acquisition pipeline. The caller receives an
 * EvidencePackage identical in shape to any other IAL result — that
 * keeps ICE and OIE unchanged.
 */
export async function runSanctionsScreening(
  req: SanctionsScreeningRequest,
): Promise<SanctionsScreeningResult> {
  const mgr = req.manager ?? getIntelligenceAcquisitionManager();
  // Sprint EP-01A — ONE capability resolves to ONE active provider.
  // An officer connector hint acts as the explicit provider override;
  // otherwise the resolver picks by environment, priority and health.
  const override = req.connectorHints?.[0];
  const resolution = mgr.resolveProvider("SANCTIONS", {
    override: override ? String(override) : undefined,
  });
  const providers = resolution.provider
    ? [{ id: resolution.provider.id, displayName: resolution.provider.displayName }]
    : [];
  const query: AcquisitionQuery = {
    ...buildQuery(req.target),
    connectors: providers.map((p) => p.id),
  };

  const pkg = req.manager
    ? await mgr.acquire(query)
    : await acquireEvidence(query);
  return {
    capability: "SANCTIONS",
    providers,
    package: pkg,
    followUps: SANCTIONS_FOLLOW_UPS,
  };
}
