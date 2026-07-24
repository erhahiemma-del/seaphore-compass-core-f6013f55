/**
 * Adaptive section renderers. Each section is pure — no data
 * fetching, no side effects. Empty inputs render nothing so the
 * Briefing Renderer can compose them safely.
 */
import { AlertTriangle, ChevronRight, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, GradeChip, SectionShell } from "./primitives";
import type {
  CriticalFinding,
  DecisionImpact as DecisionImpactData,
  DecisionRequired as DecisionRequiredData,
  EvidenceCitation,
  EvidenceGrade,
  EvidenceSourcesSummary,
  OfficerActionItem,
  OverrideDecision,
  WhyChainStep,
} from "./types";

/* ─────────────── Executive Assessment ─────────────── */

export function ExecutiveAssessment({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <SectionShell title="Executive Assessment" icon={<Sparkles className="h-4 w-4" aria-hidden />}>
      <p className="text-sm leading-relaxed text-foreground">{text}</p>
    </SectionShell>
  );
}

/* ─────────────── Critical Findings ─────────────── */

const PRIORITY_CLASS: Record<CriticalFinding["priority"], string> = {
  immediate: "bg-red-500/15 text-red-700 dark:text-red-300",
  today: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  monitor: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  archive: "bg-muted text-muted-foreground",
};

export function CriticalFindings({ findings }: { findings: CriticalFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <SectionShell title="Key Findings">
      <ul className="space-y-2">
        {findings.map((f) => (
          <li key={f.id} className="flex items-start gap-3 rounded-md border p-3">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_CLASS[f.priority]}`}
            >
              {f.priority}
            </span>
            <div className="flex-1">
              <p className="text-sm">{f.title}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <GradeChip grade={f.grade} />
                <span>· {f.source}</span>
              </p>
              {f.citations && f.citations.length > 0 && (
                <GroupedCitations citations={f.citations} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

/* ─────────────── Grouped Citations (by source, then grade) ─────────────── */

const GRADE_ORDER: EvidenceGrade[] = [
  "VERIFIED",
  "CORROBORATED",
  "OBSERVED",
  "REPORTED",
  "INFERRED",
  "UNKNOWN",
];

function groupCitations(citations: EvidenceCitation[]) {
  const bySource = new Map<string, Map<EvidenceGrade, EvidenceCitation[]>>();
  for (const c of citations) {
    const source = c.source || "Unknown source";
    if (!bySource.has(source)) bySource.set(source, new Map());
    const gradeMap = bySource.get(source)!;
    const grade = c.grade || "UNKNOWN";
    if (!gradeMap.has(grade)) gradeMap.set(grade, []);
    gradeMap.get(grade)!.push(c);
  }
  return Array.from(bySource.entries())
    .map(([source, gradeMap]) => ({
      source,
      total: Array.from(gradeMap.values()).reduce((n, arr) => n + arr.length, 0),
      grades: GRADE_ORDER.filter((g) => gradeMap.has(g)).map((g) => ({
        grade: g,
        items: gradeMap.get(g)!,
      })),
    }))
    .sort((a, b) => b.total - a.total);
}

function GroupedCitations({ citations }: { citations: EvidenceCitation[] }) {
  const groups = groupCitations(citations);
  const [active, setActive] = useState<EvidenceCitation | null>(null);
  return (
    <div className="mt-2 rounded border border-dashed bg-muted/30 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evidence cited
        </p>
        <span className="text-[10px] text-muted-foreground">
          {citations.length} record{citations.length === 1 ? "" : "s"} · {groups.length} source
          {groups.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {groups.map((g) => (
          <div key={g.source} className="rounded bg-background/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-foreground">{g.source}</p>
              <span className="text-[10px] text-muted-foreground">
                {g.total} record{g.total === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1 space-y-1.5">
              {g.grades.map(({ grade, items }) => (
                <div key={grade} className="flex flex-wrap items-start gap-2">
                  <span className="flex items-center gap-1 shrink-0">
                    <GradeChip grade={grade} />
                    <span className="text-[10px] text-muted-foreground">×{items.length}</span>
                  </span>
                  <ul className="flex-1 space-y-0.5">
                    {items.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-foreground"
                      >
                        <span className="font-mono text-muted-foreground">
                          #{c.id.slice(0, 8)}
                        </span>
                        {c.collectedAt && (
                          <span className="text-muted-foreground">
                            · {new Date(c.collectedAt).toUTCString().slice(5, 16)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setActive(c)}
                          className="text-[10px] font-medium uppercase tracking-wider text-primary underline-offset-2 hover:underline focus:outline-none focus:underline"
                        >
                          View record
                        </button>
                        {c.excerpt && (
                          <span className="block w-full text-muted-foreground">"{c.excerpt}"</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <EvidenceRecordDialog
        citation={active}
        onOpenChange={(open) => !open && setActive(null)}
      />
    </div>
  );
}

function EvidenceRecordDialog({
  citation,
  onOpenChange,
}: {
  citation: EvidenceCitation | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!citation} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Evidence record</DialogTitle>
          <DialogDescription>
            Full provenance for the cited evidence item. Officer decides.
          </DialogDescription>
        </DialogHeader>
        {citation && (
          <dl className="space-y-3 text-sm">
            <Field label="Record ID">
              <span className="font-mono text-xs break-all">{citation.id}</span>
            </Field>
            <Field label="Source system">
              <span>{citation.source || "Unknown source"}</span>
            </Field>
            <Field label="Evidence grade">
              <GradeChip grade={citation.grade || "UNKNOWN"} />
            </Field>
            <Field label="Collected at">
              <span>
                {citation.collectedAt
                  ? new Date(citation.collectedAt).toUTCString()
                  : "Not recorded"}
              </span>
            </Field>
            {citation.hash && (
              <Field label="Content hash">
                <span className="font-mono text-xs break-all">{citation.hash}</span>
              </Field>
            )}
            <Field label="Excerpt">
              {citation.excerpt ? (
                <blockquote className="rounded border-l-2 border-primary/40 bg-muted/40 p-2 text-xs italic text-muted-foreground">
                  "{citation.excerpt}"
                </blockquote>
              ) : (
                <span className="text-xs text-muted-foreground">No excerpt captured.</span>
              )}
            </Field>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}



/* ─────────────── Analytical Assessment + Why Chain ─────────────── */

export function AnalyticalAssessment({
  text,
  whyChain,
}: {
  text: string;
  whyChain?: WhyChainStep[];
}) {
  if (!text.trim()) return null;
  return (
    <div className="border-l-4 border-l-purple-500 pl-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
        Analytical conclusion
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{text}</p>
      {whyChain && whyChain.length > 0 && (
        <div className="mt-3">
          <Collapsible label="Why chain">
            <ol className="list-decimal space-y-1 pl-6 text-xs text-muted-foreground">
              {whyChain.map((c, i) => (
                <li key={`${c.step}-${i}`}>
                  <span className="font-medium text-foreground">{c.step}:</span>{" "}
                  {c.from} <ChevronRight className="inline h-3 w-3" aria-hidden /> {c.to}
                </li>
              ))}
            </ol>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Counter-Hypotheses ─────────────── */

export function CounterHypotheses({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <Collapsible label="Counter-hypotheses" tone="muted">
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        {list.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </Collapsible>
  );
}

/* ─────────────── Recommended Intelligence Collection ─────────────── */

/**
 * Map a gap description to an operational verb. Officers see action
 * language ("Run Screening") rather than system language ("Request").
 */
function operationalActionFor(gap: string): { verb: string; command: string } {
  const g = gap.toLowerCase();
  if (/sanction|screening/.test(g))
    return { verb: "Run Screening", command: `Run sanctions screening for ${gap}` };
  if (/beneficial|owner/.test(g))
    return { verb: "Resolve Ownership", command: `Resolve beneficial ownership for ${gap}` };
  if (/ais|position|track/.test(g))
    return { verb: "Collect AIS", command: `Collect AIS history for ${gap}` };
  if (/manifest/.test(g))
    return { verb: "Retrieve Manifest", command: `Retrieve cargo manifest for ${gap}` };
  if (/revenue|financial|leakage/.test(g))
    return { verb: "Assess Revenue", command: `Assess revenue exposure for ${gap}` };
  if (/compliance/.test(g))
    return { verb: "Generate Compliance Report", command: `Generate compliance report for ${gap}` };
  if (/insurance/.test(g))
    return { verb: "Retrieve Insurance", command: `Retrieve insurance record for ${gap}` };
  if (/weather/.test(g))
    return { verb: "Collect Weather", command: `Collect weather data for ${gap}` };
  return { verb: "Collect Evidence", command: gap };
}

export function IntelligenceGaps({
  gaps,
  onRequest,
}: {
  gaps: string[];
  onRequest?: (gap: string) => void;
}) {
  if (gaps.length === 0) return null;
  return (
    <SectionShell
      title="Recommended Intelligence Collection"
      icon={<AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />}
    >
      <ul className="space-y-1.5 text-sm">
        {gaps.map((g, i) => {
          const action = operationalActionFor(g);
          return (
            <li key={i} className="flex items-start justify-between gap-3 rounded-md border p-2">
              <span className="min-w-0 text-foreground">
                <span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Priority {i + 1}
                </span>
                {g}
              </span>
              <button
                type="button"
                onClick={() => onRequest?.(action.command)}
                className="shrink-0 rounded-md border border-primary/30 bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {action.verb}
              </button>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

/* ─────────────── Decision Impact ─────────────── */

const IMPACT_LABEL: Record<keyof DecisionImpactData, string> = {
  revenue: "Revenue",
  security: "Security",
  operational: "Operational",
  cargo: "Cargo",
};

export function DecisionImpact({ impact }: { impact: DecisionImpactData }) {
  return (
    <SectionShell title="Decision Impact">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(IMPACT_LABEL) as Array<keyof DecisionImpactData>).map((k) => (
          <div key={k} className="rounded-md border bg-background p-3 text-center">
            <p className="text-[10px] uppercase text-muted-foreground">{IMPACT_LABEL[k]}</p>
            <p className="text-xl font-semibold text-foreground">
              {Math.round((impact[k] ?? 0) * 100)}%
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ─────────────── Decision Required ─────────────── */

export function DecisionRequired({ decision }: { decision: DecisionRequiredData }) {
  const deadline = safeDate(decision.deadline);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950/30">
      <div>
        <p className="font-medium text-foreground">Decision required</p>
        <p className="text-xs text-muted-foreground">Deadline: {deadline}</p>
      </div>
      <span className="rounded-full bg-orange-200 px-3 py-1 text-xs font-semibold uppercase text-orange-900 dark:bg-orange-800 dark:text-orange-100">
        Risk: {decision.risk}
      </span>
    </div>
  );
}

function safeDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toUTCString();
}

/* ─────────────── Officer Actions ─────────────── */

export function OfficerActions({
  actions,
  enabled,
  accepted,
  onToggle,
}: {
  actions: OfficerActionItem[];
  enabled: boolean;
  accepted: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <SectionShell title="Officer Actions">
      {!enabled && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Actions unlock after you Agree or Modify the AI recommendation.
        </p>
      )}
      <ul className="space-y-2">
        {actions.map((a) => {
          const checked = accepted.includes(a.id);
          return (
            <li key={a.id} className="flex items-start gap-3 rounded-md border p-2">
              <input
                type="checkbox"
                disabled={!enabled}
                checked={checked}
                onChange={(e) => onToggle(a.id, e.target.checked)}
                aria-label={a.label}
                className="mt-0.5 h-4 w-4 accent-primary disabled:opacity-40"
              />
              <div>
                <label
                  className={
                    enabled ? "text-sm text-foreground" : "text-sm text-muted-foreground"
                  }
                >
                  {a.label}
                </label>
                {a.description && (
                  <p className="text-[11px] text-muted-foreground">{a.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

/* ─────────────── Human Override Bar ─────────────── */

const OVERRIDES: OverrideDecision[] = ["agree", "disagree", "modify", "dismiss"];

export function HumanOverrideBar({
  value,
  onChange,
  justification,
  onJustificationChange,
}: {
  value: OverrideDecision | null;
  onChange: (d: OverrideDecision) => void;
  justification: string;
  onJustificationChange: (v: string) => void;
}) {
  const needsJustification = value === "disagree" || value === "modify" || value === "dismiss";
  return (
    <div
      role="group"
      aria-label="Officer decision"
      className="rounded-md border bg-muted/40 p-3"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Officer decision
      </p>
      <div className="flex flex-wrap gap-2">
        {OVERRIDES.map((d) => {
          const active = value === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              aria-pressed={active}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      {needsJustification && (
        <label className="mt-3 block">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Justification (recorded to immutable audit log)
          </span>
          <textarea
            value={justification}
            onChange={(e) => onJustificationChange(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}
    </div>
  );
}

/* ─────────────── Evidence Sources trust panel ─────────────── */

export function EvidenceSourcesPanel({ sources }: { sources: EvidenceSourcesSummary }) {
  const coverage = sources.queried > 0 ? sources.responded / sources.queried : 0;
  return (
    <SectionShell
      title="Evidence Sources"
      icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden />}
    >
      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{sources.queried} queried</span>
          <span>· {sources.responded} responded</span>
          <span>· {sources.corroborated} corroborated</span>
          <span className="ml-auto text-foreground">{Math.round(coverage * 100)}% coverage</span>
        </div>
        {sources.detail && sources.detail.length > 0 && (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {sources.detail.map((s) => (
              <li
                key={s.name}
                className="flex items-center justify-between gap-2 rounded border px-2 py-1"
              >
                <span className="flex items-center gap-2">
                  <GradeChip grade={s.grade} />
                  <span className="text-foreground">{s.name}</span>
                </span>
                <span
                  className={
                    s.responded
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {s.responded ? "responded" : "no data"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  );
}

/* ─────────────── Next Intelligence Questions ─────────────── */

export function NextQuestions({
  questions,
  onAsk,
}: {
  questions: string[];
  onAsk?: (q: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <SectionShell title="Next Intelligence Questions">
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onAsk?.(q)}
            className="rounded-full border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {q}
          </button>
        ))}
      </div>
    </SectionShell>
  );
}
