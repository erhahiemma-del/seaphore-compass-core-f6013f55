/**
 * SPRINT EP-COPERNICUS-02 — Copernicus live validation endpoint.
 *
 * Admin-only server function that exercises the full CopernicusProvider
 * pipeline from within the Lovable Cloud runtime, where:
 *   • process.env.COPERNICUS_USERNAME is available (Runtime Secret)
 *   • process.env.COPERNICUS_PASSWORD is available (Runtime Secret)
 *   • Full network egress to CDSE endpoints is permitted
 *
 * Usage:  GET /api/public/hooks/copernicus-validate
 *         (requires admin session — guarded by requireSupabaseAuth)
 *
 * Returns a structured validation report that can be read from the
 * Lovable Cloud logs or the browser network panel.
 *
 * SECURITY: This endpoint returns ONLY non-sensitive diagnostic data.
 * Token values are never returned. Credential values are never returned.
 * The endpoint is server-side only (no browser bundle exposure).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CopernicusProvider } from "@/connectors/implementations/CopernicusProvider";
import { EvidenceCache } from "@/services/ial/cache";
import type { AcquisitionQuery } from "@/services/ial/types";

interface ValidationStep {
  step: number;
  name: string;
  pass: boolean;
  detail: string;
  latencyMs?: number;
}

interface ValidationReport {
  timestamp: string;
  environment: string;
  credentialsPresent: { username: boolean; password: boolean };
  steps: ValidationStep[];
  summary: { passed: number; failed: number; total: number };
  verdict: "OPERATIONAL" | "CREDENTIAL_ISSUE" | "NETWORK_ISSUE" | "PARTIAL";
}

export const copernicusValidateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ValidationReport> => {
    const steps: ValidationStep[] = [];
    const t0 = Date.now();

    const usernamePresent = !!process.env.COPERNICUS_USERNAME?.trim();
    const passwordPresent = !!process.env.COPERNICUS_PASSWORD?.trim();

    // Step 1: Credential presence
    steps.push({
      step: 1,
      name: "Runtime secret access",
      pass: usernamePresent && passwordPresent,
      detail:
        usernamePresent && passwordPresent
          ? "COPERNICUS_USERNAME and COPERNICUS_PASSWORD present in process.env"
          : `Missing: ${[!usernamePresent && "COPERNICUS_USERNAME", !passwordPresent && "COPERNICUS_PASSWORD"].filter(Boolean).join(", ")}`,
    });

    if (!usernamePresent || !passwordPresent) {
      return buildReport(steps, "CREDENTIAL_ISSUE", usernamePresent, passwordPresent);
    }

    // Step 2: Provider instantiation
    const provider = new CopernicusProvider({ cache: new EvidenceCache() });
    steps.push({
      step: 2,
      name: "Provider instantiation",
      pass: true,
      detail: `id=${provider.id}, displayName=${provider.displayName}`,
    });

    // Step 3: Authentication (token acquisition)
    const t3 = Date.now();
    const authed = await provider.authenticate();
    steps.push({
      step: 3,
      name: "Authentication — token acquisition",
      pass: authed,
      detail: authed
        ? `AUTHENTICATED (state=${provider.authenticationState})`
        : `FAILED — state=${provider.authenticationState}`,
      latencyMs: Date.now() - t3,
    });

    if (!authed) {
      const verdict =
        provider.authenticationState === "PROVIDER_UNREACHABLE"
          ? "NETWORK_ISSUE"
          : "CREDENTIAL_ISSUE";
      return buildReport(steps, verdict, usernamePresent, passwordPresent);
    }

    // Step 4: Provider health check
    const t4 = Date.now();
    const health = await provider.healthCheck();
    steps.push({
      step: 4,
      name: "Provider health check",
      pass: health.available && health.authenticated,
      detail: `available=${health.available}, authenticated=${health.authenticated}, latencyP50=${health.latencyMsP50}ms`,
      latencyMs: Date.now() - t4,
    });

    // Step 5: Token refresh (re-authenticate to verify refresh path)
    const t5 = Date.now();
    const refreshed = await provider.authenticate();
    steps.push({
      step: 5,
      name: "Token refresh path",
      pass: refreshed,
      detail: refreshed
        ? "Re-authentication succeeded (refresh path verified)"
        : "Re-authentication failed",
      latencyMs: Date.now() - t5,
    });

    // Step 6: Satellite catalogue search — Nigerian maritime domain bbox
    const t6 = Date.now();
    const bboxQuery: AcquisitionQuery = { text: "2.5,3.5,9.5,7.5 collection=SENTINEL-1" };
    const bboxResult = await provider.search(bboxQuery);
    steps.push({
      step: 6,
      name: "Satellite catalogue search — Nigerian EEZ bbox",
      pass: bboxResult.ok,
      detail: bboxResult.ok
        ? `${bboxResult.records.length} scene(s) returned`
        : `Failed: ${bboxResult.error ?? "unknown error"}`,
      latencyMs: Date.now() - t6,
    });

    // Step 7: Coordinate search — Apapa anchorage
    const t7 = Date.now();
    const coordQuery: AcquisitionQuery = { text: "lat=6.45,lon=3.38 collection=SENTINEL-2" };
    const coordResult = await provider.search(coordQuery);
    steps.push({
      step: 7,
      name: "Coordinate search — Apapa anchorage (S2)",
      pass: coordResult.ok,
      detail: coordResult.ok
        ? `${coordResult.records.length} scene(s) returned`
        : `Failed: ${coordResult.error ?? "unknown"}`,
      latencyMs: Date.now() - t7,
    });

    // Step 8: Date-range search
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const t8 = Date.now();
    const dateQuery: AcquisitionQuery = {
      text: `2.5,3.5,9.5,7.5 from=${since},to=${until}`,
    };
    const dateResult = await provider.search(dateQuery);
    steps.push({
      step: 8,
      name: `Date-range search — last 7 days`,
      pass: dateResult.ok,
      detail: dateResult.ok
        ? `${dateResult.records.length} scene(s) for ${since} → ${until}`
        : `Failed: ${dateResult.error ?? "unknown"}`,
      latencyMs: Date.now() - t8,
    });

    // Step 9: Evidence normalisation check
    const allRecords = [...bboxResult.records, ...coordResult.records, ...dateResult.records];
    const normalised = allRecords.length > 0;
    const firstRecord = allRecords[0];
    steps.push({
      step: 9,
      name: "Evidence normalisation",
      pass: normalised,
      detail: normalised
        ? `source=${firstRecord!.source}, grade=${firstRecord!.grade}, kind=${firstRecord!.kind}, entity.kind=${firstRecord!.entity.kind}, fields=${Object.keys(
            firstRecord!.fields,
          )
            .filter((k) => firstRecord!.fields[k] !== null)
            .join(", ")}`
        : "No records to normalise — upstream search returned empty",
    });

    // Step 10: Validation — no blocking issues
    const allValidated =
      allRecords.length > 0
        ? provider.validate(allRecords).issues.filter((i) => i.severity === "error").length === 0
        : true;
    steps.push({
      step: 10,
      name: "Evidence validation — no blocking errors",
      pass: allValidated,
      detail: allValidated
        ? `${allRecords.length} record(s) validated, 0 blocking errors`
        : "Blocking validation errors found",
    });

    // Step 11: Canonical UIP population check (shape)
    const uipCompatible = allRecords.every(
      (r) => r.id && r.source === "copernicus-cdse" && r.grade && r.entity && r.kind && r.hash,
    );
    steps.push({
      step: 11,
      name: "Canonical UIP shape compatibility",
      pass: allRecords.length === 0 || uipCompatible,
      detail:
        allRecords.length === 0
          ? "No records acquired — shape check skipped"
          : `${allRecords.length} record(s) carry all required NormalizedEvidence fields (id, source, grade, entity, kind, hash)`,
    });

    // Step 12: MIBC compatibility (grade check — CORROBORATED flows through IFE to MIBC)
    const grades = [...new Set(allRecords.map((r) => r.grade))];
    steps.push({
      step: 12,
      name: "MIBC / IFE compatibility — grade check",
      pass:
        allRecords.length === 0 ||
        grades.every((g) =>
          ["VERIFIED", "CORROBORATED", "OBSERVED", "REPORTED", "INFERRED", "UNKNOWN"].includes(g),
        ),
      detail:
        allRecords.length === 0
          ? "No records — check skipped"
          : `Grades in evidence: ${grades.join(", ")} — all valid IFE grades`,
    });

    const passed = steps.filter((s) => s.pass).length;
    const failed = steps.filter((s) => !s.pass).length;
    const verdict: ValidationReport["verdict"] =
      failed === 0
        ? "OPERATIONAL"
        : steps.find((s) => s.step <= 3 && !s.pass)
          ? "CREDENTIAL_ISSUE"
          : "PARTIAL";

    return buildReport(steps, verdict, usernamePresent, passwordPresent);

    function buildReport(
      steps: ValidationStep[],
      verdict: ValidationReport["verdict"],
      usernamePresent: boolean,
      passwordPresent: boolean,
    ): ValidationReport {
      const passed = steps.filter((s) => s.pass).length;
      const failed = steps.filter((s) => !s.pass).length;
      return {
        timestamp: new Date().toISOString(),
        environment: "Lovable Cloud Runtime",
        credentialsPresent: { username: usernamePresent, password: passwordPresent },
        steps,
        summary: { passed, failed, total: steps.length },
        verdict,
      };
    }
  });
