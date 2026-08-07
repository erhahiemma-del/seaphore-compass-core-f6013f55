/**
 * Intelligence — Risk Module Registry.
 *
 * A catalogue of risk modules, mirroring `LayerRegistry` in the geospatial
 * domain: modules self-describe, declare readiness, and state a reason when
 * they have no data source.
 *
 * ## Why `pending-source` is a first-class state
 *
 * Eight of the nine modules have no connected data source today. The
 * alternative to declaring that honestly is a module that returns a
 * fabricated score, or one that silently returns nothing — and an officer
 * cannot tell either apart from "we checked and found nothing". A
 * `pending-source` module returns a finding carrying its reason, so the
 * absence is visible and attributable.
 *
 * The registry holds no scoring logic and no weights. It is a catalogue.
 */
import type { IntelligenceFinding, RiskModuleId } from "./types";

/** Whether a module can produce findings today. */
export type RiskModuleStatus = "ready" | "pending-source";

/** Everything needed to evaluate a subject. Supplied by the caller. */
export interface FindingContext {
  readonly subjectId: string;
  readonly displayName: string;
  /** Evaluation time, injectable so modules are deterministic in tests. */
  readonly now: number;
}

/**
 * A risk module.
 *
 * Adding one is: implement this interface, register it, done. No UI change
 * — every surface renders from `IntelligenceFinding`.
 */
export interface RiskModule {
  readonly id: RiskModuleId;
  readonly label: string;
  /** One line an officer can read to know what this module contributes. */
  readonly description: string;
  readonly status: RiskModuleStatus;
  /** Required when `status` is `pending-source`. Asserted in tests. */
  readonly pendingReason?: string;
  /** Data dependencies, named plainly. */
  readonly requires: readonly string[];
  evaluate(context: FindingContext): Promise<readonly IntelligenceFinding[]>;
}

export class RiskModuleRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskModuleRegistryError";
  }
}

export class RiskModuleRegistry {
  private readonly modules = new Map<RiskModuleId, RiskModule>();

  /**
   * Add a module. Throws on a duplicate id, and on a `pending-source`
   * module with no reason — an unexplained absence is exactly what this
   * registry exists to prevent.
   */
  register(module: RiskModule): this {
    if (this.modules.has(module.id)) {
      throw new RiskModuleRegistryError(`Module "${module.id}" is already registered`);
    }
    if (module.status === "pending-source" && !module.pendingReason) {
      throw new RiskModuleRegistryError(
        `Module "${module.id}" is pending-source and must state a pendingReason`,
      );
    }
    this.modules.set(module.id, module);
    return this;
  }

  registerAll(modules: readonly RiskModule[]): this {
    for (const module of modules) this.register(module);
    return this;
  }

  unregister(id: RiskModuleId): boolean {
    return this.modules.delete(id);
  }

  has(id: RiskModuleId): boolean {
    return this.modules.has(id);
  }

  get(id: RiskModuleId): RiskModule | undefined {
    return this.modules.get(id);
  }

  /** Every module, ready ones first, then alphabetically by label. */
  list(): readonly RiskModule[] {
    return [...this.modules.values()].sort((a, b) => {
      if (a.status !== b.status) return a.status === "ready" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }

  /** Modules that can produce findings today. */
  ready(): readonly RiskModule[] {
    return this.list().filter((module) => module.status === "ready");
  }

  /** Modules awaiting a data source, with their reasons. */
  pending(): readonly RiskModule[] {
    return this.list().filter((module) => module.status === "pending-source");
  }

  clear(): void {
    this.modules.clear();
  }
}

/**
 * Build a finding that explains why a module produced nothing.
 *
 * Shared by every `pending-source` module so the shape of an absence is
 * identical across the platform — and so no module is tempted to invent a
 * score instead.
 */
export function pendingSourceFinding(
  module: RiskModule,
  context: FindingContext,
): IntelligenceFinding {
  return {
    id: `${module.id}:${context.subjectId}:pending`,
    subject: { kind: "vessel", id: context.subjectId, displayName: context.displayName },
    module: module.id,
    kind: `${module.id}:pending-source`,
    statement: `${module.label} could not be evaluated.`,
    producedAt: new Date(context.now).toISOString(),
    observedAt: null,
    evidence: [],
    assessment: null,
    priority: null,
    priorityRationale: null,
    dataQuality: {
      validation: "rejected",
      validationReasons: [],
      freshness: "unknown",
      ageMs: null,
      gaps: module.requires.map((requirement) => `requires ${requirement}`),
    },
    provenance: { sources: [], pipeline: [], corroboration: null },
    status: "pending-source",
    unavailableReason: module.pendingReason ?? "No data source connected.",
  };
}

/** Construct a `pending-source` module declaration. */
function pending(
  id: RiskModuleId,
  label: string,
  description: string,
  pendingReason: string,
  requires: readonly string[],
): RiskModule {
  const module: RiskModule = {
    id,
    label,
    description,
    status: "pending-source",
    pendingReason,
    requires,
    evaluate: (context) => Promise.resolve([pendingSourceFinding(module, context)]),
  };
  return module;
}

/**
 * The eight modules with no connected data source.
 *
 * Every blocker below was established by inspection or live probing, not
 * assumed. AIS Integrity is registered separately because it is the one
 * module that can actually run.
 */
export const PENDING_RISK_MODULES: readonly RiskModule[] = [
  pending(
    "navigation",
    "Navigation",
    "Course and speed anomalies against expected passage.",
    "Global Fishing Watch reports neither course nor speed on its event datasets.",
    ["course", "speed"],
  ),
  pending(
    "ownership",
    "Ownership",
    "Recent beneficial-ownership changes.",
    "OpenCorporates is catalogued as an evidence provider but is not wired to the map.",
    ["corporate registry"],
  ),
  pending(
    "sanctions",
    "Sanctions",
    "Sanctions exposure across related entities.",
    "OpenSanctions, OFAC and UN connectors exist at the IAL but are not wired to the map.",
    ["sanctions lists"],
  ),
  pending(
    "compliance",
    "Compliance",
    "Port-state control history and outstanding deficiencies.",
    "Equasis is pending terms-of-service verification.",
    ["PSC inspection records"],
  ),
  pending(
    "cargo",
    "Cargo",
    "Declared cargo against observed behaviour.",
    "No manifest source is connected.",
    ["manifests"],
  ),
  pending(
    "revenue",
    "Revenue",
    "Assessed levy against expected revenue.",
    "No NIMASA levy source is connected.",
    ["levy assessments"],
  ),
  pending(
    "environmental",
    "Environmental",
    "Weather context for observed behaviour.",
    "NOAA / Open-Meteo is connected at the IAL but not wired to the map.",
    ["marine weather"],
  ),
  pending(
    "company-intelligence",
    "Company Intelligence",
    "Corporate structure and fleet relationships.",
    "Requires OpenCorporates plus an entity-resolution path not yet built.",
    ["corporate registry", "entity resolution"],
  ),
];

/**
 * Process-wide registry.
 *
 * Construct a fresh {@link RiskModuleRegistry} in tests to stay isolated.
 * AIS Integrity registers itself from its own module.
 */
export const riskModuleRegistry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);
