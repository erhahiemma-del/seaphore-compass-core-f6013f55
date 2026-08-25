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
import type { VesselProvenance } from "@/services/geospatial";

import type { IntelligenceFinding, RiskModuleId } from "./types";

/** Whether a module can produce findings today. */
export type RiskModuleStatus = "ready" | "pending-source";

/** Everything needed to evaluate a subject. Supplied by the caller. */
export interface FindingContext {
  readonly subjectId: string;
  readonly displayName: string;
  /** Evaluation time, injectable so modules are deterministic in tests. */
  readonly now: number;
  /**
   * Lineage for the data the caller fed into the engines this subject's
   * findings will draw on. Modules copy it into `provenance.sources`; they
   * cannot infer it, because by the time evidence reaches OSAE the
   * connector it came from is no longer attached to it.
   */
  readonly sources?: readonly VesselProvenance[];
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

/**
 * What differs between two declarations of the same module id, or null
 * when they declare the same module.
 *
 * Returns a description rather than a boolean so a genuine conflict says
 * which field disagrees — "already registered" alone sends whoever hits
 * it hunting through the whole definition.
 */
function describeModuleDifference(a: RiskModule, b: RiskModule): string | null {
  if (a === b) return null;

  const fields: readonly (keyof RiskModule)[] = ["label", "description", "status", "pendingReason"];
  for (const field of fields) {
    if (a[field] !== b[field]) {
      return `${String(field)}: "${String(a[field])}" vs "${String(b[field])}"`;
    }
  }

  const before = [...a.requires].join(", ");
  const after = [...b.requires].join(", ");
  if (before !== after) return `requires: [${before}] vs [${after}]`;

  return null;
}

export class RiskModuleRegistry {
  private readonly modules = new Map<RiskModuleId, RiskModule>();

  /**
   * Add a module.
   *
   * Idempotent by *definition*, not by id. Registering the same module
   * again is a no-op; registering a different module under a taken id is
   * an error naming exactly what differs.
   *
   * ## Why re-registration is normal rather than a bug
   *
   * A module graph can be evaluated more than once in one realm — Vite
   * replaces a module on hot update, and the client and SSR graphs can
   * share a process. Each evaluation produces a *new object* with
   * identical content, so object identity alone would report a conflict
   * on every hot reload, and an id-only check would silently accept a
   * genuinely different module that happened to reuse an id.
   *
   * So equality is structural, over the declarative fields only.
   * `evaluate` is deliberately excluded: a re-evaluated module always has
   * a new function identity, and comparing it would make every hot reload
   * a conflict — which is the failure this replaced.
   *
   * The consequence worth stating plainly: this cannot detect a change
   * confined to `evaluate`'s body. A module whose logic changed but whose
   * declaration did not will keep the already-registered version until
   * the page reloads. That is the correct trade for a registry whose job
   * is to catalogue declarations, and it is a hot-reload staleness
   * question rather than a correctness one in production, where modules
   * are registered exactly once.
   */
  register(module: RiskModule): this {
    if (module.status === "pending-source" && !module.pendingReason) {
      throw new RiskModuleRegistryError(
        `Module "${module.id}" is pending-source and must state a pendingReason`,
      );
    }

    const existing = this.modules.get(module.id);
    if (existing) {
      const difference = describeModuleDifference(existing, module);
      if (difference) {
        throw new RiskModuleRegistryError(
          `Module "${module.id}" is already registered with a different definition (${difference}). ` +
            `Registration is idempotent for an identical module; replacing one is not supported — ` +
            `unregister it explicitly if that is the intent.`,
        );
      }
      // Same declaration, evaluated twice. Keep the first: swapping in an
      // identical replacement would churn identity for no gain.
      return this;
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
