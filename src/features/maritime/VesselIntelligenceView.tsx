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
import { writeAuditLog } from "@/lib/audit.functions";
import type { Vessel } from "@/services/geospatial";
import {
  aggregateFindings,
  type FindingSet,
  type IntelligenceFinding,
} from "@/services/intelligence";
import {
  buildExecutiveBrief,
  DECISION_LABEL,
  recordOfficerDecision,
  understand,
  type DecisionSink,
  type ExecutiveBriefV2,
  type OperationalRecord,
} from "@/services/orchestration";

/**
 * Persist to the append-only audit log.
 *
 * Wrapped rather than passed directly so this component depends on the
 * `DecisionSink` contract, which tests can substitute without a
 * Supabase client or an authenticated request.
 */
const auditSink: DecisionSink = (input) => writeAuditLog({ data: input });

export interface VesselIntelligenceViewProps {
  readonly vessel: Vessel;
  /**
   * Notified after a decision is recorded. Optional: the view records
   * the decision itself, so the drawer does not have to supply one to
   * make the controls work.
   */
  readonly onDecision?: (decision: BriefDecision, brief: ExecutiveBriefV2) => void;
  /** Overridden in tests. Defaults to the audit log. */
  readonly sink?: DecisionSink;
}

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly set: FindingSet; readonly brief: ExecutiveBriefV2 }
  | { readonly kind: "failed"; readonly message: string };

/**
 * The decision the officer has taken on the current brief.
 *
 * `persisted` is tracked separately from the record because a decision
 * whose audit write failed is still a decision the officer made — it is
 * shown as recorded-but-unsaved rather than silently dropped or
 * silently claimed as saved.
 */
type DecisionState = {
  readonly record: OperationalRecord;
  readonly persisted: boolean;
  readonly error: string | null;
};

export function VesselIntelligenceView({
  vessel,
  onDecision,
  sink = auditSink,
}: VesselIntelligenceViewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [openFinding, setOpenFinding] = useState<IntelligenceFinding | null>(null);
  const [decision, setDecision] = useState<DecisionState | null>(null);

  const imo = vessel.identity.imo;
  const name = vessel.identity.name;
  const provenance = vessel.provenance;

  useEffect(() => {
    let disposed = false;
    setOpenFinding(null);
    // A decision belongs to the brief it was taken on. Selecting another
    // vessel must not carry it across.
    setDecision(null);
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

  /**
   * Record the officer's decision.
   *
   * `state.brief` is passed by value and never written back, so the
   * finding set behind it is untouched by this path — the decision
   * becomes a separate operational record.
   */
  async function decide(kind: BriefDecision, brief: ExecutiveBriefV2) {
    const result = await recordOfficerDecision(brief, kind, sink);
    setDecision(result);
    onDecision?.(kind, brief);
  }

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
        onDecision={(kind, brief) => void decide(kind, brief)}
        onViewEvidence={(findingId) => {
          const finding = state.set.findings.find((candidate) => candidate.id === findingId);
          if (finding) setOpenFinding(finding);
        }}
      />

      {decision ? <DecisionReceipt state={decision} /> : null}

      <SarEvidenceNote />
    </div>
  );
}

/**
 * Confirmation that a decision was recorded.
 *
 * States explicitly that the assessment is unchanged. An officer who
 * dismisses a finding and then sees the same priority still displayed
 * would otherwise reasonably assume the control failed — the priority
 * is OSAE's and does not move because someone disagreed with it.
 */
function DecisionReceipt({ state }: { state: DecisionState }) {
  const { record, persisted, error } = state;

  return (
    <div
      data-testid="decision-receipt"
      role="status"
      className="rounded-md border border-border/60 bg-muted/20 p-3"
    >
      <p className="text-[12px] font-medium text-foreground">
        Recorded: {DECISION_LABEL[record.decision]}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Logged against this brief at {record.decidedAt.slice(0, 16).replace("T", " ")}Z. The
        assessment, its confidence and its priority are unchanged.
      </p>
      {!persisted ? (
        <p className="mt-1 text-[11px] text-amber-700">
          The decision was not written to the audit log{error ? `: ${error}` : ""}. It is shown here
          but has not been persisted.
        </p>
      ) : null}
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
