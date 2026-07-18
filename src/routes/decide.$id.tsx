import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { AuditTimeline } from "@/components/intelligence/AuditTimeline";
import { CaseHeaderBar } from "@/components/intelligence/InvestigationHeader";
import { CaseProgressChecklist } from "@/components/case-progress-checklist";
import { EvidenceCard } from "@/components/intelligence/EvidenceCard";
import { LifecycleStepper } from "@/components/lifecycle-stepper";
import { OfficerDecisionForm } from "@/components/officer-decision-form";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RecommendationPanel } from "@/components/recommendation-panel";
import { RiskPill } from "@/components/intelligence/RiskPill";
import {
  AUDIT_TRAIL,
  CASE_PROGRESS,
  EVIDENCE_ITEMS,
  RULES_TRIGGERED,
  investigationById,
} from "@/lib/lifecycle-data";

export const Route = createFileRoute("/decide/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Decision Support · Seaphore` }],
  }),
  component: DecisionSupport,
});

function DecisionSupport() {
  const { id } = Route.useParams();
  const inv = investigationById(id);
  const totalImpact = RULES_TRIGGERED.reduce((s) => s + 1, 0);

  return (
    <AppShell title="Decision Support" subtitle={inv.id} mode="light">
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        <CaseHeaderBar
          investigationId={inv.id}
          vessel={inv.vessel}
          mission={inv.mission}
          officer={inv.officer}
          status="Awaiting Decision"
          risk={inv.risk}
          confidence="observed"
        />

        {/* DS-1 Lifecycle Stepper */}
        <LifecycleStepper
          steps={[
            { key: "inv", label: "Investigate", status: "complete" },
            { key: "ds", label: "Decision Support", status: "active" },
            { key: "sh", label: "Share", status: "pending" },
            { key: "learn", label: "Learn", status: "pending" },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          {/* Left column — DS-2 + DS-3 */}
          <aside className="space-y-3">
            <PanelCard>
              <PanelHead title="Investigation Summary" meta="System of record" />
              <dl className="grid grid-cols-1 gap-2 text-[12px]">
                <Row label="Investigation ID" value={inv.id} mono />
                <Row label="Vessel" value={inv.vessel} />
                <Row label="IMO" value={inv.imo} mono />
                <Row label="Type" value="Bulk carrier" />
                <Row label="Flag" value={inv.flag} />
                <Row label="Voyage" value={inv.voyage} mono />
                <Row label="Route" value={inv.route} />
                <Row label="Cargo Declared" value={inv.cargoDeclared} />
                <Row label="Arrival" value={inv.arrival} />
                <Row label="Key Signal" value={inv.keySignal} />
                <div className="flex items-center justify-between pt-1">
                  <span className="type-label text-slate">Risk Level</span>
                  <RiskPill level={inv.risk} />
                </div>
              </dl>
            </PanelCard>

            <CaseProgressChecklist steps={CASE_PROGRESS} showWorkflowLink={false} />
          </aside>

          {/* Centre — DS-4 recommendation + DS-5..DS-8 decision form + disclaimer */}
          <div className="space-y-4">
            <RecommendationPanel
              action="Approve Clearance"
              confidencePct={86}
              evidenceCount={EVIDENCE_ITEMS.length}
              rulesCount={RULES_TRIGGERED.length}
              sourcesCount={5}
              rationale="Observed AIS gap has a plausible operational explanation; declared cargo aligns with prior voyages. Duty base within acceptable band."
            />

            <OfficerDecisionForm
              officerName={inv.officer}
              officerRank="Commander, Nigerian Navy"
            />

            {/* DS-8 disclaimer */}
            <div className="rounded-lg border-l-4 border-[color:var(--color-amber)] bg-[color:var(--color-amber)]/5 px-4 py-3 text-[12px] text-foreground/85">
              <b>Important:</b> You are making the final decision. Seaphore
              provides recommendations and evidence, but you are accountable
              for the decision.
              <div className="mt-1 text-[11px] font-semibold text-slate">
                Assist, never decide. Officer decides.
              </div>
            </div>
          </div>

          {/* Right — DS-9 */}
          <aside className="space-y-3">
            <PanelCard>
              <PanelHead title="Evidence Summary" />
              <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
                <Mini label="Docs" value={EVIDENCE_ITEMS.filter((e) => e.type === "PDF").length} />
                <Mini label="Signals" value={2} />
                <Mini label="Sources" value={5} />
              </div>
            </PanelCard>

            <PanelCard>
              <PanelHead title="Rules Triggered" meta={`${RULES_TRIGGERED.length} total`} />
              <div className="mb-2 grid grid-cols-3 gap-1 text-center text-[11px]">
                <ImpactPill label="High" count={RULES_TRIGGERED.filter((r) => r.impact === "HIGH").length} hex="#C0392B" />
                <ImpactPill label="Med" count={RULES_TRIGGERED.filter((r) => r.impact === "MEDIUM").length} hex="#B06A00" />
                <ImpactPill label="Low" count={RULES_TRIGGERED.filter((r) => r.impact === "LOW").length} hex="#1E6B3A" />
              </div>
              <ul className="space-y-1 text-[12px]">
                {RULES_TRIGGERED.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="type-mono text-[11px] text-slate">{r.id}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <RiskPill level={r.impact} />
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] text-slate">
                Total rule impact score: <b>{totalImpact}</b>
              </div>
            </PanelCard>

            <PanelCard>
              <PanelHead title="Key Evidence" meta="Ranked by relevance" />
              <div className="space-y-2">
                {EVIDENCE_ITEMS.slice(0, 3).map((e) => (
                  <EvidenceCard key={e.id} item={e} />
                ))}
              </div>
            </PanelCard>
          </aside>
        </div>

        {/* DS-9 audit trail spans full width */}
        <AuditTimeline events={AUDIT_TRAIL} />
      </div>
    </AppShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-1 last:border-0">
      <span className="type-label text-slate">{label}</span>
      <span className={`text-[12px] font-semibold text-foreground text-right ${mono ? "type-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-2/60 py-2">
      <div className="text-[18px] font-extrabold text-foreground">{value}</div>
      <div className="type-label text-slate">{label}</div>
    </div>
  );
}

function ImpactPill({ label, count, hex }: { label: string; count: number; hex: string }) {
  return (
    <div className="rounded-md py-1.5" style={{ color: hex, backgroundColor: `${hex}14` }}>
      <div className="text-[15px] font-extrabold">{count}</div>
      <div className="text-[10px] font-bold uppercase">{label}</div>
    </div>
  );
}
