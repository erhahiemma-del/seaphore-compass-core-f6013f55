/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT DIAG-02 — Intelligence Coverage & Readiness (pure model)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Turns three honest inputs — the Evidence Provider Catalog, live
 *  provider health, and observed evidence counts — into per-KPI coverage
 *  states, root causes and a platform readiness score.
 *
 *  This module is PURE and READ-ONLY. It changes no architecture: it
 *  never acquires, fuses, scores, persists or resolves providers. It
 *  only classifies what the rest of the platform already reports, so a
 *  KPI can never silently show "0" or "—" for a structural gap.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Officer-facing smart state for a KPI. Never a bare zero. */
export type KpiStateCode =
  | "ACTIVE"
  | "AWAITING_CREDENTIALS"
  | "PROVIDER_OFFLINE"
  | "RATE_LIMITED"
  | "NO_EVIDENCE"
  | "PROJECTION_MISSING"
  | "DASHBOARD_MAPPING_ERROR"
  | "NO_PROVIDER";

/** Machine-classified reason a KPI is not reporting a real number. */
export type RootCause =
  | "NONE"
  | "PROVIDER_MISSING"
  | "CREDENTIALS_MISSING"
  | "CREDENTIALS_INVALID"
  | "PROVIDER_OFFLINE"
  | "API_FAILURE"
  | "RATE_LIMITED"
  | "EMPTY_EVIDENCE"
  | "CANONICAL_UIP_MISSING"
  | "PROJECTION_MISSING"
  | "DASHBOARD_MAPPING_ERROR";

export type ProviderCoverageStatus =
  | "OPERATIONAL"
  | "PARTIAL"
  | "AWAITING_CREDENTIALS"
  | "CREDENTIALS_INVALID"
  | "RATE_LIMITED"
  | "OFFLINE"
  | "NOT_REGISTERED";

export type KpiDomainKey = "manifest" | "vessel" | "container" | "revenue" | "risk" | "historical";

/** The nine trace checks required by the DIAG-02 audit. */
export interface CoverageChecks {
  providerRegistered: boolean;
  providerHealthy: boolean;
  credentialsConfigured: boolean;
  apiReachable: boolean;
  dataReturned: boolean;
  evidencePackageCreated: boolean;
  canonicalUipPopulated: boolean;
  projectionContractMapped: boolean;
  dashboardFieldMapped: boolean;
}

export const COVERAGE_CHECK_ORDER: ReadonlyArray<keyof CoverageChecks> = [
  "providerRegistered",
  "providerHealthy",
  "credentialsConfigured",
  "apiReachable",
  "dataReturned",
  "evidencePackageCreated",
  "canonicalUipPopulated",
  "projectionContractMapped",
  "dashboardFieldMapped",
];

export const COVERAGE_CHECK_LABELS: Record<keyof CoverageChecks, string> = {
  providerRegistered: "Provider Registered",
  providerHealthy: "Provider Healthy",
  credentialsConfigured: "Credentials Configured",
  apiReachable: "API Reachable",
  dataReturned: "Data Returned",
  evidencePackageCreated: "EvidencePackage Created",
  canonicalUipPopulated: "Canonical UIP Populated",
  projectionContractMapped: "Projection Contract Mapped",
  dashboardFieldMapped: "Dashboard Reading Correct Field",
};

/** One provider as it serves a specific KPI. */
export interface KpiProviderCoverage {
  providerId: string;
  providerName: string;
  status: ProviderCoverageStatus;
  capabilities: ReadonlyArray<string>;
  certification: "CERTIFIED" | "FAILED" | "UNKNOWN";
  credentialEnv: ReadonlyArray<string>;
  lastSuccessfulSync: string | null;
  lastCheckedAt: string | null;
  lastValidationDate: string | null;
  lastError: string | null;
  quotaRemaining: number | null;
}

export interface KpiCoverage {
  key: KpiDomainKey;
  title: string;
  descriptor: string;
  /** Officer-facing headline; never "0"/"—" unless genuinely measured. */
  display: string;
  /** Genuine numeric value when one exists, else null. */
  value: number | null;
  state: KpiStateCode;
  stateLabel: string;
  /** One-line honest explanation of the state. */
  stateDetail: string;
  rootCause: RootCause;
  rootCauseDetail: string;
  evidenceCount: number;
  coveragePct: number;
  confidence: "observed" | "inferred" | "unverified" | "unknown";
  projectionContractId: string;
  projectionStatus: "MAPPED" | "MISSING";
  dashboardField: string;
  dashboardStatus: "READING_CORRECT_FIELD" | "MAPPING_ERROR";
  checks: CoverageChecks;
  providers: ReadonlyArray<KpiProviderCoverage>;
  /** Where the officer goes to inspect the providers behind this KPI. */
  providerCatalogHref: string;
  /** Exact file responsible for producing the number. */
  sourceOfTruth: string;
}

export interface IntelligenceReadiness {
  overallPct: number;
  operational: ReadonlyArray<string>;
  partial: ReadonlyArray<string>;
  awaitingConfiguration: ReadonlyArray<string>;
  offline: ReadonlyArray<string>;
  totalProviders: number;
  /** KPIs currently reporting a genuine, live value. */
  activeKpis: number;
  totalKpis: number;
}

export interface IntelligenceCoverageReport {
  generatedAt: string;
  readiness: IntelligenceReadiness;
  kpis: ReadonlyArray<KpiCoverage>;
}

/* ───────────────────────── state vocabulary ───────────────────────── */

export const KPI_STATE_META: Record<
  KpiStateCode,
  { label: string; dot: string; tone: "good" | "warn" | "bad" | "neutral" | "info" }
> = {
  ACTIVE: { label: "Active", dot: "🟢", tone: "good" },
  AWAITING_CREDENTIALS: { label: "Waiting for Credentials", dot: "🟡", tone: "warn" },
  PROVIDER_OFFLINE: { label: "Provider Offline", dot: "🔴", tone: "bad" },
  RATE_LIMITED: { label: "Rate Limited", dot: "🟠", tone: "warn" },
  // Checked, and nothing qualified. Neutral: an empty result is an answer.
  NO_EVIDENCE: { label: "No Evidence Found", dot: "⚪", tone: "neutral" },
  PROJECTION_MISSING: { label: "Projection Missing", dot: "🔵", tone: "info" },
  DASHBOARD_MAPPING_ERROR: { label: "Dashboard Mapping Error", dot: "🟣", tone: "bad" },
  /**
   * Never configured — not a failure.
   *
   * This carried 🔴/bad, identical to PROVIDER_OFFLINE, which made an
   * unconnected source look like an active operational alert. The two are
   * opposites: PROVIDER_OFFLINE is a provider we rely on that went down
   * and warrants alarm; NO_PROVIDER is one nobody has connected yet, and
   * dressing that as danger trains officers to ignore red.
   *
   * Neutral tone, but a distinct glyph and label from NO_EVIDENCE — "we
   * never looked" must stay readable apart from "we looked and found
   * nothing". Severity for release-readiness is unaffected: that report
   * reads `state`, not `tone`, and still treats this as BLOCKING.
   */
  NO_PROVIDER: { label: "Data source not connected", dot: "○", tone: "neutral" },
};

export const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  NONE: "None — reporting live evidence",
  PROVIDER_MISSING: "Provider Missing",
  CREDENTIALS_MISSING: "Credentials Missing",
  CREDENTIALS_INVALID: "Credentials Invalid — rejected upstream",
  PROVIDER_OFFLINE: "Provider Offline",
  API_FAILURE: "API Failure",
  RATE_LIMITED: "Rate Limited",
  EMPTY_EVIDENCE: "Empty Evidence",
  CANONICAL_UIP_MISSING: "Canonical UIP Missing",
  PROJECTION_MISSING: "Projection Missing",
  DASHBOARD_MAPPING_ERROR: "Dashboard Mapping Error",
};

/* ───────────────────────── KPI declarations ───────────────────────── */

export interface KpiDeclaration {
  key: KpiDomainKey;
  title: string;
  descriptor: string;
  /** Capabilities that COULD serve this KPI (Connector Framework vocabulary). */
  capabilities: ReadonlyArray<string>;
  projectionContractId: string;
  dashboardField: string;
  sourceOfTruth: string;
  /** Formats a genuine value for the officer. */
  format: (value: number) => string;
}

const fmtCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

const fmtNaira = (n: number): string => {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n}`;
};

export const KPI_DECLARATIONS: ReadonlyArray<KpiDeclaration> = [
  {
    key: "manifest",
    title: "Manifest Intelligence",
    descriptor: "Manifest Records Indexed",
    capabilities: ["CARGO"],
    projectionContractId: "kpi.manifest-intelligence",
    dashboardField: "coverage.kpis.manifest.display",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    format: fmtCount,
  },
  {
    key: "vessel",
    title: "Vessel Intelligence",
    descriptor: "Vessel Profiles Maintained",
    capabilities: ["IDENTITY", "VESSEL_SCREENING"],
    projectionContractId: "kpi.vessel-intelligence",
    dashboardField: "coverage.kpis.vessel.display",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    format: fmtCount,
  },
  {
    key: "container",
    title: "Container Intelligence",
    descriptor: "Container Movements Tracked",
    capabilities: ["CARGO"],
    projectionContractId: "kpi.container-intelligence",
    dashboardField: "coverage.kpis.container.display",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    format: fmtCount,
  },
  {
    key: "revenue",
    title: "Revenue Intelligence",
    descriptor: "Revenue at Risk",
    capabilities: ["CARGO"],
    projectionContractId: "kpi.revenue-intelligence",
    dashboardField: "coverage.kpis.revenue.display",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    format: fmtNaira,
  },
  {
    key: "risk",
    title: "Risk Intelligence",
    descriptor: "Screened Risk Exposure",
    capabilities: ["SANCTIONS"],
    projectionContractId: "kpi.risk-intelligence",
    dashboardField: "coverage.kpis.risk.display",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    format: (n) => `${n}%`,
  },
  {
    key: "historical",
    title: "Historical Intelligence",
    descriptor: "Movement History Coverage",
    capabilities: ["POSITION", "PORT_CALL"],
    projectionContractId: "kpi.historical-intelligence",
    dashboardField: "coverage.kpis.historical.display",
    sourceOfTruth: "src/lib/server/intelligence/coverage.server.ts",
    format: (n) => (n < 1 ? `${Math.round(n * 12)} mo` : `${n} yr`),
  },
];

/* ───────────────────────────── inputs ────────────────────────────── */

/** Catalog projection (subset of CatalogRow) — no catalog changes. */
export interface CoverageCatalogRow {
  providerId: string;
  providerName: string;
  capabilities: ReadonlyArray<string>;
  credentialEnv: ReadonlyArray<string>;
  certification: "CERTIFIED" | "FAILED";
  lastValidationDate: string;
  projectionContractId: string;
}

/** Health projection (subset of ProviderHealthSnapshot). */
export interface CoverageHealthRow {
  id: string;
  state:
    | "healthy"
    | "degraded"
    | "credentials-missing"
    | "credentials-invalid"
    | "unauthenticated"
    | "offline";
  checkedAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  quotaRemaining: number | null;
  failureRate: number;
}

/** Observed evidence for one KPI domain, measured server-side. */
export interface DomainEvidence {
  /** Rows of evidence actually observed for the domain. */
  evidenceCount: number;
  /** Genuine measured value, when the domain has one. */
  value: number | null;
  /** True when the canonical UIP / durable store holds the domain. */
  uipPopulated: boolean;
  confidence?: KpiCoverage["confidence"];
}

/** Fields the Mission Control ribbon actually binds to (see MissionControl.tsx). */
export const DASHBOARD_KPI_FIELDS: ReadonlyArray<string> = KPI_DECLARATIONS.map(
  (d) => d.dashboardField,
);

export interface CoverageInput {
  generatedAt: string;
  catalog: ReadonlyArray<CoverageCatalogRow>;
  health: ReadonlyArray<CoverageHealthRow>;
  /** providerId → whether every required credential env var is present. */
  credentials: Readonly<Record<string, boolean>>;
  evidence: Readonly<Record<KpiDomainKey, DomainEvidence>>;
  /** Projection-contract ids that exist in the registry. */
  mappedProjectionIds: ReadonlyArray<string>;
  /** Dashboard fields the UI actually reads. */
  mappedDashboardFields: ReadonlyArray<string>;
}

/* ─────────────────────────── classification ──────────────────────── */

function isRateLimited(row: CoverageHealthRow | undefined): boolean {
  if (!row) return false;
  if (row.quotaRemaining !== null && row.quotaRemaining <= 0) return true;
  return /rate limit|429|too many requests|quota/i.test(row.lastError ?? "");
}

export function classifyProviderStatus(
  catalogRow: CoverageCatalogRow,
  health: CoverageHealthRow | undefined,
  credentialsConfigured: boolean,
): ProviderCoverageStatus {
  if (catalogRow.credentialEnv.length > 0 && !credentialsConfigured) {
    return "AWAITING_CREDENTIALS";
  }
  if (!health) return "NOT_REGISTERED";
  if (isRateLimited(health)) return "RATE_LIMITED";
  switch (health.state) {
    case "healthy":
      return "OPERATIONAL";
    case "degraded":
      return "PARTIAL";
    case "credentials-invalid":
      return "CREDENTIALS_INVALID";
    case "credentials-missing":
    case "unauthenticated":
      return "AWAITING_CREDENTIALS";
    case "offline":
    default:
      return "OFFLINE";
  }
}

const READY_STATUSES: ReadonlyArray<ProviderCoverageStatus> = ["OPERATIONAL", "PARTIAL"];

function resolveKpi(
  decl: KpiDeclaration,
  input: CoverageInput,
  providers: ReadonlyArray<KpiProviderCoverage>,
): KpiCoverage {
  const evidence = input.evidence[decl.key];
  const projectionMapped = input.mappedProjectionIds.includes(decl.projectionContractId);
  const dashboardMapped = input.mappedDashboardFields.includes(decl.dashboardField);

  const ready = providers.filter((p) => READY_STATUSES.includes(p.status));
  const apiReachable = providers.some(
    (p) => READY_STATUSES.includes(p.status) || p.status === "RATE_LIMITED",
  );
  const checks: CoverageChecks = {
    providerRegistered: providers.length > 0,
    providerHealthy: providers.some((p) => p.status === "OPERATIONAL"),
    credentialsConfigured: providers.every(
      (p) =>
        p.credentialEnv.length === 0 ||
        (p.status !== "AWAITING_CREDENTIALS" && p.status !== "CREDENTIALS_INVALID"),
    ),
    apiReachable,
    dataReturned: evidence.evidenceCount > 0,
    evidencePackageCreated: evidence.evidenceCount > 0,
    canonicalUipPopulated: evidence.uipPopulated,
    projectionContractMapped: projectionMapped,
    dashboardFieldMapped: dashboardMapped,
  };
  if (providers.length === 0) checks.credentialsConfigured = false;

  // Root-cause precedence: acquisition → evidence → fusion → projection → UI.
  let state: KpiStateCode;
  let rootCause: RootCause;
  let detail: string;

  if (providers.length === 0) {
    state = "NO_PROVIDER";
    rootCause = "PROVIDER_MISSING";
    detail = `No Evidence Provider declares ${decl.capabilities.join(" / ")}. Nothing can populate this KPI yet.`;
  } else if (
    providers.every(
      (p) => p.status === "AWAITING_CREDENTIALS" || p.status === "CREDENTIALS_INVALID",
    )
  ) {
    // Rejected credentials outrank absent ones: an invalid key is a
    // defect the officer must be told about, not a pending setup task.
    const invalid = providers.filter((p) => p.status === "CREDENTIALS_INVALID");
    state = "AWAITING_CREDENTIALS";
    rootCause = invalid.length > 0 ? "CREDENTIALS_INVALID" : "CREDENTIALS_MISSING";
    detail =
      invalid.length > 0
        ? `Credentials rejected upstream by ${invalid.map((p) => p.providerName).join(", ")}. Check the configured API token.`
        : `Awaiting credentials for ${providers.map((p) => p.providerName).join(", ")}.`;
  } else if (ready.length === 0 && providers.some((p) => isRateLimitedStatus(p))) {
    state = "RATE_LIMITED";
    rootCause = "RATE_LIMITED";
    detail = "Every provider serving this KPI is currently rate limited upstream.";
  } else if (ready.length === 0) {
    const offline = providers.filter(
      (p) => p.status === "OFFLINE" || p.status === "NOT_REGISTERED",
    );
    state = "PROVIDER_OFFLINE";
    rootCause = offline.some((p) => p.lastError) ? "API_FAILURE" : "PROVIDER_OFFLINE";
    detail =
      offline.find((p) => p.lastError)?.lastError ??
      `Providers unreachable: ${offline.map((p) => p.providerName).join(", ") || "unknown"}.`;
  } else if (evidence.evidenceCount === 0) {
    state = "NO_EVIDENCE";
    rootCause = "EMPTY_EVIDENCE";
    detail = `${ready.map((p) => p.providerName).join(", ")} reachable, but no evidence has been acquired for this domain yet.`;
  } else if (!evidence.uipPopulated) {
    state = "NO_EVIDENCE";
    rootCause = "CANONICAL_UIP_MISSING";
    detail = "Evidence exists but has not reached the canonical UIP for this domain.";
  } else if (!projectionMapped) {
    state = "PROJECTION_MISSING";
    rootCause = "PROJECTION_MISSING";
    detail = `No Projection Contract entry for ${decl.projectionContractId}.`;
  } else if (!dashboardMapped) {
    state = "DASHBOARD_MAPPING_ERROR";
    rootCause = "DASHBOARD_MAPPING_ERROR";
    detail = `Dashboard is not reading ${decl.dashboardField}.`;
  } else {
    state = "ACTIVE";
    rootCause = "NONE";
    detail = `Live from ${ready.map((p) => p.providerName).join(", ")}.`;
  }

  const passed = COVERAGE_CHECK_ORDER.filter((k) => checks[k]).length;
  const coveragePct = Math.round((passed / COVERAGE_CHECK_ORDER.length) * 100);

  const genuine = state === "ACTIVE" && evidence.value !== null;
  const meta = KPI_STATE_META[state];

  return {
    key: decl.key,
    title: decl.title,
    descriptor: decl.descriptor,
    display: genuine ? decl.format(evidence.value as number) : meta.label,
    value: genuine ? evidence.value : null,
    state,
    stateLabel: meta.label,
    stateDetail: detail,
    rootCause,
    rootCauseDetail: `${ROOT_CAUSE_LABELS[rootCause]} — ${detail}`,
    evidenceCount: evidence.evidenceCount,
    coveragePct,
    confidence: genuine ? (evidence.confidence ?? "observed") : "unknown",
    projectionContractId: decl.projectionContractId,
    projectionStatus: projectionMapped ? "MAPPED" : "MISSING",
    dashboardField: decl.dashboardField,
    dashboardStatus: dashboardMapped ? "READING_CORRECT_FIELD" : "MAPPING_ERROR",
    checks,
    providers,
    providerCatalogHref: "/admin/provider-health",
    sourceOfTruth: decl.sourceOfTruth,
  };
}

function isRateLimitedStatus(p: KpiProviderCoverage): boolean {
  return p.status === "RATE_LIMITED";
}

export function buildIntelligenceCoverage(input: CoverageInput): IntelligenceCoverageReport {
  const healthById = new Map(input.health.map((h) => [h.id, h]));

  const providerStatus = new Map<string, ProviderCoverageStatus>();
  for (const row of input.catalog) {
    providerStatus.set(
      row.providerId,
      classifyProviderStatus(
        row,
        healthById.get(row.providerId),
        input.credentials[row.providerId] ?? false,
      ),
    );
  }

  const kpis = KPI_DECLARATIONS.map((decl) => {
    const providers: KpiProviderCoverage[] = input.catalog
      .filter((row) => row.capabilities.some((c) => decl.capabilities.includes(c)))
      .map((row) => {
        const health = healthById.get(row.providerId);
        return {
          providerId: row.providerId,
          providerName: row.providerName,
          status: providerStatus.get(row.providerId) ?? "NOT_REGISTERED",
          capabilities: row.capabilities,
          certification: row.certification,
          credentialEnv: row.credentialEnv,
          lastSuccessfulSync: health?.lastSuccessAt ?? null,
          lastCheckedAt: health?.checkedAt ?? null,
          lastValidationDate: row.lastValidationDate,
          lastError: health?.lastError ?? null,
          quotaRemaining: health?.quotaRemaining ?? null,
        };
      });
    return resolveKpi(decl, input, providers);
  });

  const nameOf = (id: string) => input.catalog.find((r) => r.providerId === id)?.providerName ?? id;
  const idsWith = (statuses: ReadonlyArray<ProviderCoverageStatus>) =>
    [...providerStatus.entries()].filter(([, s]) => statuses.includes(s)).map(([id]) => nameOf(id));

  const operational = idsWith(["OPERATIONAL"]);
  const partial = idsWith(["PARTIAL", "RATE_LIMITED"]);
  const awaiting = idsWith(["AWAITING_CREDENTIALS", "CREDENTIALS_INVALID"]);
  const offline = idsWith(["OFFLINE", "NOT_REGISTERED"]);
  const total = input.catalog.length;
  const overallPct =
    total === 0 ? 0 : Math.round(((operational.length + partial.length * 0.5) / total) * 100);

  return {
    generatedAt: input.generatedAt,
    readiness: {
      overallPct,
      operational,
      partial,
      awaitingConfiguration: awaiting,
      offline,
      totalProviders: total,
      activeKpis: kpis.filter((k) => k.state === "ACTIVE").length,
      totalKpis: kpis.length,
    },
    kpis,
  };
}
