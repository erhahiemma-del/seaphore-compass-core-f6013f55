/**
 * ─────────────────────────────────────────────────────────────────────
 *  PART 2 — EVIDENCE PROVIDER CERTIFICATION FRAMEWORK (Sprint PF-01)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Every provider is certified BEFORE registration. Failed certification
 *  = failed registration. The certifier reads only what already exists:
 *  the provider instance, its source text (optional but required for the
 *  architectural prohibitions), and the Officer-Facing Projection
 *  Contract registry.
 *
 *  It creates no registry, no cache, no orchestration and mutates
 *  nothing.
 * ─────────────────────────────────────────────────────────────────────
 */
import { PROJECTION_CONTRACT } from "@/lib/projection-contract/registry";
import type { Connector } from "@/services/ial/connectors/base";
import {
  APPROVED_LEGACY_API,
  FROZEN_PROVIDER_API,
  SUPPORTED_SPEC_VERSIONS,
  type EvidenceProviderV1,
} from "./spec";

export type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

export interface CertificationCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail?: string;
}

export interface CertificationReport {
  readonly providerId: string;
  readonly specVersion: string | null;
  readonly certified: boolean;
  readonly checks: ReadonlyArray<CertificationCheck>;
  readonly failures: ReadonlyArray<CertificationCheck>;
}

export interface CertificationOptions {
  /**
   * Source text of the provider module. Required for the architectural
   * prohibitions (no Supabase, no persistence, no duplicate registry).
   * Omitted → those checks report SKIPPED and certification FAILS,
   * because an uninspected provider is not a certified provider.
   */
  readonly source?: string;
  /** Ids already registered — used for the unique-id check. */
  readonly existingIds?: ReadonlyArray<string>;
  /** Projection contract ids (defaults to the live registry). */
  readonly projectionContractIds?: ReadonlyArray<string>;
}

const FORBIDDEN_SOURCE_PATTERNS: ReadonlyArray<{
  id: string;
  label: string;
  pattern: RegExp;
}> = [
  {
    id: "no-supabase",
    label: "No Supabase imports",
    pattern: /from\s+["'][^"']*supabase[^"']*["']|supabaseAdmin|createClient\(/,
  },
  { id: "no-register-uip", label: "No registerUip()", pattern: /registerUip\s*\(/ },
  {
    id: "no-persistence",
    label: "No persistence",
    pattern: /\.from\(["'][a-z_]+["']\)\s*\.\s*(insert|upsert|update|delete)|localStorage|\.persist\(/,
  },
  {
    id: "no-identity-resolution",
    label: "No identity resolution",
    pattern: /resolveIdentity|identityResolver|dedupeEntities|mergeEntities/,
  },
  {
    id: "no-duplicate-registry",
    label: "No duplicate registry / cache",
    pattern: /class\s+\w*(Registry|Cache)\b/,
  },
];

const REQUIRED_SOURCE_PATTERNS: ReadonlyArray<{
  id: string;
  label: string;
  pattern: RegExp;
}> = [
  { id: "uses-cache", label: "Uses ConnectorCache (EvidenceCache)", pattern: /EvidenceCache/ },
  { id: "uses-normalize-record", label: "Uses normalizeRecord()", pattern: /normalizeRecord\s*\(/ },
  { id: "uses-validate-records", label: "Uses validateRecords()", pattern: /validateRecords\s*\(/ },
  { id: "uses-stable-hash", label: "Uses stableHash()", pattern: /stableHash\s*\(/ },
  { id: "returns-connector-result", label: "Returns ConnectorResult", pattern: /ConnectorResult/ },
];

/** Public method names declared in a provider's source (TS visibility aware). */
export function publicMethodsFromSource(source: string): string[] {
  const out: string[] = [];
  const re = /^\s{2}(?!\/\/)(?:public\s+)?(?:override\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*\(/gm;
  const privateRe = /^\s{2}(?:private|protected|#)/;
  for (const line of source.split("\n")) {
    if (privateRe.test(line)) continue;
    re.lastIndex = 0;
    const m = re.exec(line);
    if (m) out.push(m[1]);
  }
  return Array.from(new Set(out));
}

/**
 * Certify a provider against Evidence Provider Specification v1.0.
 * Pure and side-effect free — callers decide what to do with the report.
 */
export function certifyProvider(
  provider: Connector | EvidenceProviderV1,
  opts: CertificationOptions = {},
): CertificationReport {
  const checks: CertificationCheck[] = [];
  const p = provider as Partial<EvidenceProviderV1> & Connector;
  const source = opts.source;
  const contractIds =
    opts.projectionContractIds ?? PROJECTION_CONTRACT.map((e) => e.id);

  const add = (id: string, label: string, ok: boolean, detail?: string) =>
    checks.push({ id, label, status: ok ? "PASS" : "FAIL", detail: ok ? undefined : detail });

  // ── Identity & metadata ────────────────────────────────────────────
  const id = typeof p.id === "string" ? p.id.trim() : "";
  add("provider-id", "Unique provider ID", id.length > 0, "provider.id is missing");
  add(
    "unique-id",
    "Provider ID not already registered",
    id.length > 0 && !(opts.existingIds ?? []).includes(id),
    `duplicate provider id "${id}"`,
  );
  add(
    "metadata",
    "Metadata complete",
    typeof p.displayName === "string" && p.displayName.trim().length > 0,
    "displayName is missing",
  );
  add(
    "spec-version",
    "Spec version declared (Evidence Provider Specification v1.0)",
    typeof p.specVersion === "string" && SUPPORTED_SPEC_VERSIONS.includes(p.specVersion),
    `specVersion must be one of ${SUPPORTED_SPEC_VERSIONS.join(", ")}`,
  );
  add(
    "capabilities",
    "Capability declared",
    Array.isArray(p.capabilities) && p.capabilities.length > 0,
    "capabilities[] is empty",
  );
  add(
    "provider-type",
    "Provider type declared",
    typeof p.provider?.providerType === "string",
    "provider.providerType is missing",
  );
  add(
    "environment",
    "Environment declared",
    typeof p.provider?.environment === "string",
    "provider.environment is missing",
  );
  add(
    "resolver-compatible",
    "Uses Provider Resolver (priority + enabled declared)",
    typeof p.provider?.priority === "number" && typeof p.provider?.enabled === "boolean",
    "provider.priority / provider.enabled missing — resolver cannot select this provider",
  );

  // ── Frozen API surface ─────────────────────────────────────────────
  for (const m of FROZEN_PROVIDER_API) {
    add(
      `method-${m}`,
      `${m}() implemented`,
      typeof (p as unknown as Record<string, unknown>)[m] === "function",
      `${m}() is not implemented`,
    );
  }

  // ── Projection Contract ────────────────────────────────────────────
  const contractId = p.projectionContractId;
  add(
    "projection-contract",
    "Projection Contract declared",
    typeof contractId === "string" && contractIds.includes(contractId),
    contractId
      ? `projectionContractId "${contractId}" is not in the Projection Contract registry`
      : "projectionContractId is missing",
  );

  // ── Source-level architectural guarantees ──────────────────────────
  if (!source) {
    for (const c of [...REQUIRED_SOURCE_PATTERNS, ...FORBIDDEN_SOURCE_PATTERNS]) {
      checks.push({
        id: c.id,
        label: c.label,
        status: "SKIPPED",
        detail: "provider source not supplied to the certifier",
      });
    }
    checks.push({
      id: "api-freeze",
      label: "Connector API freeze respected",
      status: "SKIPPED",
      detail: "provider source not supplied to the certifier",
    });
  } else {
    for (const c of REQUIRED_SOURCE_PATTERNS) {
      add(c.id, c.label, c.pattern.test(source), `${c.label} — not found in provider source`);
    }
    for (const c of FORBIDDEN_SOURCE_PATTERNS) {
      add(c.id, c.label, !c.pattern.test(source), `${c.label} — prohibited pattern found`);
    }
    const allowed = new Set<string>([...FROZEN_PROVIDER_API, ...APPROVED_LEGACY_API]);
    const extra = publicMethodsFromSource(source).filter((m) => !allowed.has(m));
    add(
      "api-freeze",
      "Connector API freeze respected",
      extra.length === 0,
      `unapproved public methods: ${extra.join(", ")}`,
    );
  }

  const failures = checks.filter((c) => c.status !== "PASS");
  return {
    providerId: id,
    specVersion: typeof p.specVersion === "string" ? p.specVersion : null,
    certified: failures.length === 0,
    checks,
    failures,
  };
}

/** Human-readable certification report (used by tests and tooling). */
export function formatCertificationReport(report: CertificationReport): string {
  const head = `${report.certified ? "CERTIFIED" : "NOT CERTIFIED"} — ${report.providerId} (spec ${report.specVersion ?? "?"})`;
  const lines = report.checks.map(
    (c) =>
      `${c.status === "PASS" ? "PASS" : c.status === "FAIL" ? "FAIL" : "SKIP"}  ${c.label}` +
      (c.detail ? ` — ${c.detail}` : ""),
  );
  return [head, ...lines].join("\n");
}
