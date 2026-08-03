/**
 * Officer-Facing Projection Contract — validator.
 *
 * Enforces Golden Rule invariants over the registry. Used by the admin
 * projection audit view and by unit tests to fail the build when a new
 * artifact is added without a projection decision.
 */

import type {
  ContractValidationIssue,
  ContractValidationReport,
  ProjectionContractEntry,
} from "./types";
import { PROJECTION_CONTRACT } from "./registry";

export function validateContract(
  entries: ReadonlyArray<ProjectionContractEntry> = PROJECTION_CONTRACT,
): ContractValidationReport {
  const issues: ContractValidationIssue[] = [];
  const seen = new Set<string>();
  let projected = 0;
  let internal = 0;
  let justified = 0;

  for (const e of entries) {
    if (seen.has(e.id)) {
      issues.push({ id: e.id, problem: "duplicate id" });
    }
    seen.add(e.id);

    switch (e.state) {
      case "PROJECTED":
        projected++;
        if (!e.projection) {
          issues.push({ id: e.id, problem: "PROJECTED entry missing `projection`" });
        } else {
          if (!e.projection.surface)
            issues.push({ id: e.id, problem: "projection.surface required" });
          if (!e.projection.location)
            issues.push({ id: e.id, problem: "projection.location required" });
        }
        if (e.internal || e.justified) {
          issues.push({ id: e.id, problem: "PROJECTED entry must not carry internal/justified" });
        }
        break;
      case "INTERNAL":
        internal++;
        if (!e.internal) {
          issues.push({ id: e.id, problem: "INTERNAL entry missing `internal`" });
        } else if (!e.internal.note) {
          issues.push({ id: e.id, problem: "internal.note required" });
        }
        if (e.projection || e.justified) {
          issues.push({ id: e.id, problem: "INTERNAL entry must not carry projection/justified" });
        }
        break;
      case "JUSTIFIED_UNNECESSARY":
        justified++;
        if (!e.justified) {
          issues.push({ id: e.id, problem: "JUSTIFIED entry missing `justified`" });
        } else if (!e.justified.justification) {
          issues.push({ id: e.id, problem: "justified.justification required" });
        }
        if (e.projection || e.internal) {
          issues.push({ id: e.id, problem: "JUSTIFIED entry must not carry projection/internal" });
        }
        break;
      default:
        issues.push({ id: e.id, problem: `unknown state: ${(e as { state: string }).state}` });
    }
  }

  return {
    totalEntries: entries.length,
    projected,
    internal,
    justified,
    issues,
    ok: issues.length === 0,
  };
}

/** Assert a backend artifact id has an entry. Callable from producer code. */
export function assertContracted(id: string): void {
  const found = PROJECTION_CONTRACT.some((e) => e.id === id);
  if (!found) {
    // Non-fatal in production; loud in dev. The Golden Rule violation is
    // real — surface it in the console so the audit view catches it too.
    // eslint-disable-next-line no-console
    console.warn(
      `[projection-contract] Missing entry for backend artifact "${id}". ` +
        `Add it to src/lib/projection-contract/registry.ts with a projection state.`,
    );
  }
}
