/**
 * SPRINT CAP-02 — Cargo Intelligence Centre view.
 *
 * Presentation only. Every figure is a projection of the Canonical UIP
 * produced by `cargo-workspace-projection.ts`. When there is nothing
 * honest to show, the centre names its operational state instead.
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Boxes, FileSearch, Sparkles } from "lucide-react";

import { PanelCard } from "@/components/panel-card";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { PanelStateNotice } from "@/components/intelligence/PanelStateNotice";
import { Button } from "@/components/ui/button";
import { KPI_STATE_META } from "@/lib/intelligence/coverage-model";
import type { CargoCentreProjection } from "@/lib/intelligence/cargo-workspace-projection";
import { useWorkspaceStore } from "@/stores/workspace.store";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  good: "text-[color:var(--color-teal)]",
  warn: "text-amber-600",
  bad: "text-red-600",
  info: "text-sky-600",
  neutral: "text-slate",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function CargoCentreStateChip({ projection }: { projection: CargoCentreProjection }) {
  const meta = KPI_STATE_META[projection.state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 type-label",
        TONE_CLASS[meta.tone] ?? "text-slate",
      )}
    >
      <span aria-hidden>{meta.dot}</span>
      {projection.stateLabel}
    </span>
  );
}

export function CargoCentreView({ projection }: { projection: CargoCentreProjection }) {
  const { centre, data } = projection;
  const navigate = useNavigate();
  const createInvestigation = useWorkspaceStore((s) => s.createInvestigation);
  const addEvidence = useWorkspaceStore((s) => s.addEvidence);

  const openInvestigation = () => {
    const id = createInvestigation({
      title: `${centre.title} — cargo review`,
      missionType: "CARGO",
      caseType: "CARGO",
      sourceUipId: projection.uipId ?? undefined,
      subjectId: data?.leads[0]?.entityId,
      subjectName: data?.leads[0]?.label,
    });
    for (const row of data?.evidence ?? []) {
      addEvidence(id, {
        title: row.title,
        source: row.source,
        category: "COLLECTED",
        grade: row.grade,
        entityId: row.entityId,
        entityName: row.entityLabel,
        hash: row.hash,
        summary: `${centre.title} · observed ${fmtTime(row.observedAt)}`,
      });
    }
    navigate({ to: "/workspace/$id", params: { id } });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── KPI cards ─────────────────────────────────────────────── */}
      <section aria-label="Key indicators">
        {!data ? (
          <PanelCard>
            <PanelStateNotice
              state={projection.state}
              detail={projection.stateDetail}
              href={centre.capabilityHref}
              hrefLabel="Inspect capability"
            />
          </PanelCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.kpis.map((k) => (
              <PanelCard key={k.key}>
                <div className="type-label text-slate">{k.label}</div>
                <div className="mt-1 type-mono text-[22px] font-bold tabular-nums text-foreground">
                  {k.value}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <ConfidenceChip tier={k.confidence} size={9} />
                </div>
                <p className="mt-1.5 type-small text-slate">{k.hint}</p>
              </PanelCard>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Timeline ────────────────────────────────────────────── */}
        <PanelCard className="flex flex-col">
          <SectionHeader title="Timeline" subtitle="Canonical UIP · observation order" />
          {!data ? (
            <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
          ) : (
            <ol className="divide-y divide-line">
              {data.timeline.map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-2.5">
                  <span className="type-mono whitespace-nowrap text-[11px] text-slate">
                    {fmtTime(t.at)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-small font-semibold text-foreground">
                      {t.title}
                    </span>
                    <span className="block truncate type-small text-slate">{t.detail}</span>
                  </span>
                  <ConfidenceChip tier={t.confidence} size={9} />
                </li>
              ))}
            </ol>
          )}
        </PanelCard>

        {/* ── Investigation panel ─────────────────────────────────── */}
        <PanelCard className="flex flex-col">
          <SectionHeader title="Investigation" subtitle="Leads ranked by evidence weight" />
          {!data ? (
            <PanelStateNotice state={projection.state} detail={projection.stateDetail} />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {data.leads.map((l) => (
                  <li key={l.entityId} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate type-small font-semibold text-foreground">
                        {l.label}
                      </span>
                      <span className="type-mono block truncate text-[11px] text-slate">
                        {l.entityId}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="type-mono text-[12px] font-semibold tabular-nums">
                        {l.evidenceCount}
                      </span>
                      <ConfidenceChip tier={l.confidence} size={9} />
                    </span>
                  </li>
                ))}
              </ul>
              <Button className="mt-3 w-full" size="sm" onClick={openInvestigation}>
                <Boxes className="mr-1.5 h-3.5 w-3.5" />
                Open in Investigation Workspace
              </Button>
            </>
          )}
          <div className="mt-3">
            <div className="type-label text-slate">Recommended next actions</div>
            <ul className="mt-1.5 space-y-1">
              {projection.recommendedActions.map((a) => (
                <li key={a} className="flex items-start gap-1.5 type-small text-foreground/85">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </PanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Evidence panel ──────────────────────────────────────── */}
        <PanelCard className="flex flex-col">
          <SectionHeader title="Evidence" subtitle="Traceable records behind every number" />
          {!data ? (
            <PanelStateNotice
              state={projection.state}
              detail={projection.stateDetail}
              href="/intelligence-evidence"
              hrefLabel="Open Intelligence Evidence"
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.evidence.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate type-small font-semibold text-foreground">
                      {e.title}
                    </span>
                    <ConfidenceChip tier={e.confidence} size={9} />
                  </div>
                  <div className="type-mono mt-0.5 truncate text-[11px] text-slate">
                    {e.source} · {e.grade} · {fmtTime(e.observedAt)} · {e.hash.slice(0, 12)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        {/* ── AI Summary + Intelligence Status ────────────────────── */}
        <div className="flex flex-col gap-4">
          <PanelCard>
            <SectionHeader title="AI Summary" subtitle="Derived from this projection only" />
            {!data ? (
              <p className="type-small text-slate">
                No summary is produced without evidence. {projection.stateDetail}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.summary.map((s) => (
                  <li key={s} className="flex items-start gap-1.5 type-small text-foreground/85">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>

          <PanelCard>
            <SectionHeader title="Intelligence Status" subtitle="Honest operational state" />
            <div className="flex flex-wrap items-center gap-2">
              <CargoCentreStateChip projection={projection} />
              {data ? <ConfidenceChip tier={data.confidence} size={9} /> : null}
            </div>
            <dl className="mt-3 space-y-1.5 type-small">
              <Row label="Capability" value={centre.capabilityId} />
              <Row label="Projection binding" value={centre.projectionContractId} />
              <Row label="Coverage domain" value={centre.coverageKey} />
              <Row label="Canonical UIP" value={projection.uipId ?? "none in session"} />
              <Row
                label="Evidence records"
                value={data ? `${data.evidenceCount}` : "not reported"}
              />
              <Row label="Root cause" value={projection.rootCauseDetail || "None"} />
            </dl>
            <a
              href="/admin/provider-health"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--color-blue)] hover:underline"
            >
              <FileSearch className="h-3.5 w-3.5" /> Inspect provider health
            </a>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="type-h6 font-semibold text-foreground">{title}</h2>
      <p className="type-small text-slate">{subtitle}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="type-mono max-w-[62%] truncate text-right text-[11px] text-foreground/85">
        {value}
      </dd>
    </div>
  );
}
