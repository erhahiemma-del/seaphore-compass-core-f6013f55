/**
 * Vessel intelligence — findings, brief and evidence for one vessel.
 *
 * Runs the existing `aggregateFindings()` over the registered risk
 * modules and renders the result through the existing
 * `ExecutiveBriefPanel` and `FindingEvidenceViewer`. It introduces no
 * engine, no scoring and no second registry.
 *
 * ## Provenance reaches the findings
 *
 * The vessel carries a `VesselProvenance` from whichever connector
 * observed it — Global Fishing Watch today. That is passed into
 * `aggregateFindings`, so evidence is attributed to the real provider
 * instead of falling back to `unattributed`. Without this the connector's
 * lineage stops one layer above the finding that depends on it.
 *
 * ## Progressive disclosure
 *
 *   brief → finding → why → evidence → source provenance
 *
 * Raw provider data is never the default view. The officer opens it.
 */
import { useEffect, useState } from "react";

import {
  ExecutiveBriefPanel,
  type BriefDecision,
} from "@/components/intelligence/ExecutiveBriefPanel";
import { FindingEvidenceViewer } from "@/components/intelligence/FindingEvidenceViewer";
import { Button } from "@/components/ui/button";
import type { Vessel } from "@/services/geospatial";
import {
  aggregateFindings,
  type FindingSet,
  type IntelligenceFinding,
} from "@/services/intelligence";
import { buildExecutiveBrief, understand, type ExecutiveBriefV2 } from "@/services/orchestration";

export interface VesselIntelligenceViewProps {
  readonly vessel: Vessel;
  readonly onDecision?: (decision: BriefDecision, brief: ExecutiveBriefV2) => void;
}

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly set: FindingSet; readonly brief: ExecutiveBriefV2 }
  | { readonly kind: "failed"; readonly message: string };

export function VesselIntelligenceView({ vessel, onDecision }: VesselIntelligenceViewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [openFinding, setOpenFinding] = useState<IntelligenceFinding | null>(null);

  const imo = vessel.identity.imo;
  const name = vessel.identity.name;
  const provenance = vessel.provenance;

  useEffect(() => {
    let disposed = false;
    setOpenFinding(null);
    setState({ kind: "loading" });

    void aggregateFindings(imo, name, {
      // The connector's lineage, carried through so findings are
      // attributed rather than anonymous.
      sources: provenance ? [provenance] : undefined,
    })
      .then((set) => {
        if (disposed) return;
        const brief = buildExecutiveBrief(understand(`Investigate ${name}`), set);
        setState({ kind: "ready", set, brief });
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      disposed = true;
    };
  }, [imo, name, provenance]);

  if (state.kind === "loading") {
    return <Note>Evaluating intelligence modules…</Note>;
  }

  if (state.kind === "failed") {
    // A failed evaluation is not an absence of risk.
    return (
      <Note tone="warning">
        Intelligence evaluation failed: {state.message}. No conclusion should be drawn from the
        absence of findings here.
      </Note>
    );
  }

  if (openFinding) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Button
          variant="link"
          size="sm"
          className="h-6 self-start px-0 text-[11px]"
          onClick={() => setOpenFinding(null)}
        >
          ← Back to brief
        </Button>
        <FindingEvidenceViewer finding={openFinding} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <ExecutiveBriefPanel
        brief={state.brief}
        findings={state.set.findings}
        onDecision={onDecision}
        onViewEvidence={(findingId) => {
          const finding = state.set.findings.find((candidate) => candidate.id === findingId);
          if (finding) setOpenFinding(finding);
        }}
      />

      <SarEvidenceNote />
    </div>
  );
}

/**
 * SAR evidence, contextually.
 *
 * Surfaced here rather than on a separate page, per the existing
 * selection flow. There is no detector configured, so there is nothing to
 * show — and saying that plainly is the only honest option. Generating a
 * plausible detection would put a fabricated vessel on an officer's
 * evidence trail.
 */
function SarEvidenceNote() {
  return (
    <div
      data-testid="sar-evidence-note"
      className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3"
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Satellite (SAR)
      </h3>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        No SAR evidence available. Sentinel-1 scenes can be catalogued, but no ship-detection
        service is configured, so imagery has not been analysed. This is a gap in Seaphore&apos;s
        processing, not an observation that nothing was present.
      </p>
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "warning" }) {
  return (
    <div className="p-3">
      <p
        className={
          tone === "warning" ? "text-[12px] text-amber-700" : "text-[12px] text-muted-foreground"
        }
      >
        {children}
      </p>
    </div>
  );
}
