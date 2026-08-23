/**
 * Intelligence — Finding Aggregator.
 *
 * Runs every registered module for a subject and collects the results.
 *
 * ## What it does not do
 *
 * It does not score, weight, rank, average, or overwrite. It never touches
 * `confidence`, `band`, `priority`, `freshness` or `grade` — those belong
 * to `reasoning`, OSAE, `freshness.ts` and the OSINT confidence engine
 * respectively, and the aggregator copies them through untouched.
 *
 * There is deliberately **no overall risk score**. A single number would
 * have to weight nine modules against each other, and any such weighting
 * would be invented — precisely the hidden scoring the architecture
 * forbids. Instead the aggregator reports every module's contribution
 * separately, including the ones that contributed nothing and why.
 */
import type { VesselProvenance } from "@/services/geospatial";

import { RiskModuleRegistry, riskModuleRegistry, type FindingContext } from "./module-registry";
import { validateFinding, type IntelligenceFinding, type RiskModuleId } from "./types";

/** One module's contribution, including an empty one. */
export interface ModuleContribution {
  readonly module: RiskModuleId;
  readonly label: string;
  readonly status: "ready" | "pending-source";
  readonly findings: readonly IntelligenceFinding[];
  /** Populated when the module produced nothing usable. */
  readonly unavailableReason: string | null;
  /** Set when `evaluate` threw. The aggregator never lets one module break the rest. */
  readonly error: string | null;
}

/** The complete picture for one subject. */
export interface FindingSet {
  readonly subjectId: string;
  readonly producedAt: string;
  readonly findings: readonly IntelligenceFinding[];
  /** Every module, in registry order — contributors and non-contributors alike. */
  readonly contributions: readonly ModuleContribution[];
  readonly counts: {
    readonly supported: number;
    readonly insufficientEvidence: number;
    readonly pendingSource: number;
    readonly notApplicable: number;
  };
  /**
   * Contract violations detected across the set. Non-empty means a module
   * emitted a finding the architecture forbids — surfaced, not swallowed.
   */
  readonly violations: readonly { readonly findingId: string; readonly message: string }[];
}

export interface AggregateOptions {
  readonly registry?: RiskModuleRegistry;
  /** Restrict to specific modules. Defaults to all registered. */
  readonly modules?: readonly RiskModuleId[];
  readonly now?: number;
  /**
   * Lineage of the data the caller fed into the engines.
   *
   * Modules copy this into `provenance.sources` and onto their evidence.
   * It has to come from the caller because by the time an observation
   * reaches OSAE the connector that produced it is no longer attached —
   * so a module cannot recover it, and without this a finding built from
   * live Global Fishing Watch data is labelled `unattributed` despite
   * having perfectly good provenance one layer up.
   */
  readonly sources?: readonly VesselProvenance[];
}

/**
 * Evaluate every registered module for one subject.
 *
 * Modules run in parallel — they are independent by contract, and running
 * them sequentially would make the slowest module the floor for all.
 * A module that throws is isolated: its contribution records the error and
 * every other module still reports.
 */
export async function aggregateFindings(
  subjectId: string,
  displayName: string,
  options: AggregateOptions = {},
): Promise<FindingSet> {
  const registry = options.registry ?? riskModuleRegistry;
  const now = options.now ?? Date.now();
  const context: FindingContext = { subjectId, displayName, now, sources: options.sources };

  const selected = options.modules
    ? registry.list().filter((module) => options.modules?.includes(module.id))
    : registry.list();

  const contributions = await Promise.all(
    selected.map(async (module): Promise<ModuleContribution> => {
      try {
        const findings = await module.evaluate(context);
        const unavailable = findings.every((finding) => finding.status !== "supported")
          ? (findings[0]?.unavailableReason ?? module.pendingReason ?? null)
          : null;
        return {
          module: module.id,
          label: module.label,
          status: module.status,
          findings,
          unavailableReason: unavailable,
          error: null,
        };
      } catch (error) {
        return {
          module: module.id,
          label: module.label,
          status: module.status,
          findings: [],
          unavailableReason: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const findings = contributions.flatMap((contribution) => [...contribution.findings]);

  const counts = {
    supported: findings.filter((f) => f.status === "supported").length,
    insufficientEvidence: findings.filter((f) => f.status === "insufficient-evidence").length,
    pendingSource: findings.filter((f) => f.status === "pending-source").length,
    notApplicable: findings.filter((f) => f.status === "not-applicable").length,
  };

  const violations = findings.flatMap((finding) =>
    validateFinding(finding).map((violation) => ({
      findingId: finding.id,
      message: `${violation.code}: ${violation.message}`,
    })),
  );

  return {
    subjectId,
    producedAt: new Date(now).toISOString(),
    findings,
    contributions,
    counts,
    violations,
  };
}

/**
 * Findings that carry an operational priority, most urgent first.
 *
 * Ordering uses OSAE's own priority vocabulary. The aggregator assigns no
 * priority of its own — it only orders what OSAE already decided.
 */
export function byPriority(
  findings: readonly IntelligenceFinding[],
): readonly IntelligenceFinding[] {
  const rank = { urgent: 0, act: 1, monitor: 2, watch: 3 } as const;
  return findings
    .filter((finding) => finding.priority !== null)
    .sort((a, b) => rank[a.priority!] - rank[b.priority!]);
}

/** Every distinct evidence reference across a set, de-duplicated by id. */
export function collectEvidence(findings: readonly IntelligenceFinding[]) {
  const seen = new Map<string, IntelligenceFinding["evidence"][number]>();
  for (const finding of findings) {
    for (const ref of finding.evidence) if (!seen.has(ref.id)) seen.set(ref.id, ref);
  }
  return [...seen.values()];
}
