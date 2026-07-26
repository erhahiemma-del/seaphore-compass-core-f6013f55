/**
 * SPRINT GFW-01 — credential state classification.
 *
 * An absent token and a rejected token are different officer-facing
 * facts; the coverage model must never collapse them into one status.
 */
import { describe, it, expect } from "vitest";
import {
  classifyProviderStatus,
  type CoverageCatalogRow,
  type CoverageHealthRow,
} from "@/lib/intelligence/coverage-model";

const catalog: CoverageCatalogRow = {
  providerId: "global-fishing-watch",
  providerName: "Global Fishing Watch",
  capabilities: ["POSITION"],
  credentialEnv: ["GFW_API_TOKEN"],
  registered: true,
  projectionContractId: "ial.global-fishing-watch-evidence-provider",
} as CoverageCatalogRow;

function health(
  state: CoverageHealthRow["state"],
  lastError: string | null = null,
): CoverageHealthRow {
  return {
    id: "global-fishing-watch",
    state,
    checkedAt: "2026-07-26T00:00:00.000Z",
    lastSuccessAt: null,
    lastError,
    quotaRemaining: null,
    failureRate: 0,
  };
}

describe("GFW credential classification", () => {
  it("reports AWAITING_CREDENTIALS when no token is configured", () => {
    expect(classifyProviderStatus(catalog, health("credentials-missing"), false)).toBe(
      "AWAITING_CREDENTIALS",
    );
  });

  it("reports CREDENTIALS_INVALID when the token is configured but rejected", () => {
    expect(
      classifyProviderStatus(
        catalog,
        health("credentials-invalid", "Authentication Failed — Credentials Invalid (HTTP 401)"),
        true,
      ),
    ).toBe("CREDENTIALS_INVALID");
  });

  it("reports OPERATIONAL once the token authenticates", () => {
    expect(classifyProviderStatus(catalog, health("healthy"), true)).toBe("OPERATIONAL");
  });

  it("keeps an unreachable provider distinct from a credential problem", () => {
    expect(
      classifyProviderStatus(catalog, health("offline", "Provider Unreachable — timeout"), true),
    ).toBe("OFFLINE");
  });
});
