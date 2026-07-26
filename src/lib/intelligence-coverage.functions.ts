/**
 * Thin server-function wrapper for the Intelligence Coverage & Readiness
 * report (Sprint DIAG-02). Only imports and declarations live here.
 */
import { createServerFn } from "@tanstack/react-start";
import type { IntelligenceCoverageReport } from "@/lib/intelligence/coverage-model";

export const getIntelligenceCoverage = createServerFn({ method: "GET" }).handler(
  async (): Promise<IntelligenceCoverageReport> => {
    const { getIntelligenceCoverageReport } = await import(
      "@/lib/server/intelligence/coverage.server"
    );
    return getIntelligenceCoverageReport();
  },
);
