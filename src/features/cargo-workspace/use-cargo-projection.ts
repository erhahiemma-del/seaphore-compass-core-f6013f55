/**
 * SPRINT CAP-02 — Cargo Intelligence Workspace data access.
 *
 * One shared read of the DIAG-02 coverage report plus the Canonical UIP.
 * No fetching of provider data happens here — the workspace is a pure
 * consumer of projections.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getIntelligenceCoverage } from "@/lib/intelligence-coverage.functions";
import type { KpiCoverage, KpiDomainKey } from "@/lib/intelligence/coverage-model";
import {
  projectCargoCentre,
  projectCargoWorkspace,
  type CargoCentreDefinition,
  type CargoCentreProjection,
} from "@/lib/intelligence/cargo-workspace-projection";
import { scanForLeakage } from "@/services/revenue-leakage";
import { useUipStore } from "@/stores/uip.store";

function useCoverage() {
  return useQuery({
    queryKey: ["intelligence-coverage"],
    queryFn: () => getIntelligenceCoverage(),
    staleTime: 60_000,
  });
}

function useCargoInputs() {
  const uip = useUipStore((s) => {
    const id = s.order[0];
    return id ? s.byId[id] : undefined;
  });
  const { data: coverage, isLoading } = useCoverage();
  const evidence = uip?.rawEvidence ?? [];
  // Reuses capability.revenue-leakage-detection — no duplicated business logic.
  const findings = useMemo(
    () => (evidence.length > 0 ? scanForLeakage(evidence) : []),
    [evidence],
  );
  const coverageByKey = useMemo(() => {
    const map = new Map<string, KpiCoverage>((coverage?.kpis ?? []).map((k) => [k.key, k]));
    return (key: KpiDomainKey) => map.get(key);
  }, [coverage]);

  return { uipId: uip?.id ?? null, evidence, findings, coverageByKey, isLoading };
}

export function useCargoCentreProjection(centre: CargoCentreDefinition): {
  projection: CargoCentreProjection;
  isLoading: boolean;
} {
  const { uipId, evidence, findings, coverageByKey, isLoading } = useCargoInputs();
  const projection = useMemo(
    () =>
      projectCargoCentre({
        centre,
        uipId,
        evidence,
        findings,
        coverage: coverageByKey(centre.coverageKey),
      }),
    [centre, uipId, evidence, findings, coverageByKey],
  );
  return { projection, isLoading };
}

export function useCargoWorkspaceProjections(): {
  projections: ReadonlyArray<CargoCentreProjection>;
  isLoading: boolean;
} {
  const { uipId, evidence, findings, coverageByKey, isLoading } = useCargoInputs();
  const projections = useMemo(
    () => projectCargoWorkspace({ uipId, evidence, findings, coverageByKey }),
    [uipId, evidence, findings, coverageByKey],
  );
  return { projections, isLoading };
}
