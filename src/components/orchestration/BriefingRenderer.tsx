/**
 * LAYER 3 — UX Specification.
 *
 * Renders the Intelligence Contract (Layer 2.8) as the 20-section Active
 * State Layout described in spec 3.3. Assembly rules from the Briefing
 * Builder guarantee no empty cards; this component simply switches on
 * `section.kind`.
 *
 * Every screen renders the mandatory footer:
 *   "Evidence first. Explainable always. Officer decides."
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { EVIDENCE_GRADES } from "@/services/orchestration/constants";
import type {
  Briefing,
  BriefingSection,
  EvidenceGrade,
  OverrideDecision,
} from "@/services/orchestration";

type SectionPayload<K extends keyof import("@/services/orchestration").SectionPayloads> =
  import("@/services/orchestration").SectionPayloads[K];

interface Props {
  briefing: Briefing;
  onOverride?: (decision: OverrideDecision, justification?: string) => Promise<void> | void;
}

export function BriefingRenderer({ briefing, onOverride }: Props) {
  const [override, setOverride] = useState<OverrideDecision | null>(null);
  const [justification, setJustification] = useState("");
  const [chainOpen, setChainOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);

  const byKind = useMemo(() => {
    const m = new Map<BriefingSection["kind"], BriefingSection>();
    for (const s of briefing.sections) m.set(s.kind, s);
    return m;
  }, [briefing.sections]);

  async function submitOverride(decision: OverrideDecision) {
    setOverride(decision);
    await onOverride?.(decision, justification || undefined);
  }

  return (
    <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
      {/* 5. Classification banner */}
      <ClassificationBanner briefing={briefing} />

      <div className="space-y-6 p-6">
        {/* 6. Executive Assessment (mandatory except lookup) */}
        {byKind.has("executive") && (
          <Section title="Executive Assessment" icon={<Sparkles className="h-4 w-4" />}>
            <p className="text-sm leading-relaxed text-foreground">
              {(byKind.get("executive")!.payload as SectionPayload<"executive">).text}
            </p>
          </Section>
        )}

        {/* 7. Why This Matters */}
        {byKind.has("why_this_matters") && (
          <Section title="Why This Matters">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(
                byKind.get("why_this_matters")!.payload as SectionPayload<"why_this_matters">
              ).chain.map((step, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="rounded-md border bg-muted/40 px-2 py-1 font-medium">
                    {step.step}
                  </span>
                  <span className="text-muted-foreground">
                    {step.from} → {step.to}
                  </span>
                  {i < 4 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 8. Critical Findings */}
        {byKind.has("critical_findings") && (
          <Section title="Critical Findings">
            <ul className="space-y-2">
              {(
                byKind.get("critical_findings")!.payload as SectionPayload<"critical_findings">
              ).findings.map((f, i) => (
                <li key={i} className="flex items-start gap-3 rounded-md border p-3">
                  <PriorityBadge
                    priority={f.priority as "immediate" | "today" | "monitor" | "archive"}
                  />
                  <div className="flex-1">
                    <p className="text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <GradeChip grade={f.grade as EvidenceGrade} /> · {f.source}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 9. Verified Evidence */}
        {byKind.has("verified_evidence") && (
          <Section title="Verified Evidence">
            <div className="grid gap-3 md:grid-cols-2">
              {(
                byKind.get("verified_evidence")!.payload as SectionPayload<"verified_evidence">
              ).items.map((item, i) => (
                <div key={i} className="rounded-md border bg-background p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <GradeChip grade="VERIFIED" />
                  </div>
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 10. Observed Patterns */}
        {byKind.has("observed_patterns") && (
          <Section title="Observed Patterns">
            <ul className="space-y-2">
              {(
                byKind.get("observed_patterns")!.payload as SectionPayload<"observed_patterns">
              ).patterns.map((p, i) => (
                <li key={i} className="rounded-md border p-3">
                  <p className="text-sm">{p.pattern}</p>
                  {p.caseRefs.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Case refs: {p.caseRefs.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 11. Analytical Assessment */}
        {byKind.has("analytical_assessment") && (
          <div className="border-l-4 border-l-purple-500 pl-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
              Analytical conclusion
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              {
                (
                  byKind.get("analytical_assessment")!
                    .payload as SectionPayload<"analytical_assessment">
                ).text
              }
            </p>
            {/* 12. Explainability Chain — collapsible below analytical assessment */}
            {byKind.has("explainability_chain") && (
              <button
                type="button"
                onClick={() => setChainOpen((v) => !v)}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {chainOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Why Chain
              </button>
            )}
            {chainOpen && (
              <ol className="mt-2 list-decimal space-y-1 pl-6 text-xs text-muted-foreground">
                {(
                  byKind.get("explainability_chain")!
                    .payload as SectionPayload<"explainability_chain">
                ).chain.map((c, i) => (
                  <li key={i}>
                    {c.step}: {c.from} → {c.to}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* 13. Counter-Hypotheses (collapsible, muted) */}
        {byKind.has("counter_hypotheses") && (
          <div className="rounded-md border bg-muted/30 p-3">
            <button
              type="button"
              onClick={() => setCounterOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"
            >
              {counterOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Counter-Hypotheses
            </button>
            {counterOpen && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {(
                  byKind.get("counter_hypotheses")!.payload as SectionPayload<"counter_hypotheses">
                ).list.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 14. Intelligence Gaps */}
        {byKind.has("intelligence_gaps") && (
          <Section
            title="Intelligence Gaps"
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          >
            <ul className="space-y-1 text-sm">
              {(
                byKind.get("intelligence_gaps")!.payload as SectionPayload<"intelligence_gaps">
              ).list.map((g, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-md border p-2"
                >
                  <span>{g}</span>
                  <button type="button" className="text-xs text-primary hover:underline">
                    Request
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* 15. Decision Impact — 4 metrics */}
        {byKind.has("decision_impact") && (
          <Section title="Decision Impact">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["revenue", "security", "operational", "cargo"] as const).map((k) => {
                const val =
                  (byKind.get("decision_impact")!.payload as Record<string, number>)[k] ?? 0;
                return (
                  <div key={k} className="rounded-md border bg-background p-3 text-center">
                    <p className="text-[10px] uppercase text-muted-foreground">{k}</p>
                    <p className="text-xl font-semibold">{Math.round(val * 100)}%</p>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* 16. Decision Required */}
        {byKind.has("decision_required") && (
          <div className="flex items-center justify-between rounded-md border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950/30">
            <div>
              <p className="font-medium">Decision required</p>
              <p className="text-xs text-muted-foreground">
                Deadline:{" "}
                {new Date(
                  (byKind.get("decision_required")!.payload as SectionPayload<"decision_required">)
                    .deadline,
                ).toUTCString()}
              </p>
            </div>
            <span className="rounded-full bg-orange-200 px-3 py-1 text-xs font-semibold uppercase text-orange-900 dark:bg-orange-800 dark:text-orange-100">
              Risk:{" "}
              {
                (byKind.get("decision_required")!.payload as SectionPayload<"decision_required">)
                  .risk
              }
            </span>
          </div>
        )}

        {/* 17. Officer Actions — disabled until Agree/Modify */}
        {byKind.has("officer_actions") && (
          <Section title="Officer Actions">
            <ul className="space-y-2">
              {(
                byKind.get("officer_actions")!.payload as SectionPayload<"officer_actions">
              ).actions.map((a) => {
                const enabled = override === "agree" || override === "modify";
                return (
                  <li key={a.id} className="flex items-center gap-3 rounded-md border p-2">
                    <input type="checkbox" disabled={!enabled} className="h-4 w-4" />
                    <label className={enabled ? "text-sm" : "text-sm text-muted-foreground"}>
                      {a.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* 18. Human Override Bar */}
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Officer decision
          </p>
          <div className="flex flex-wrap gap-2">
            {(["agree", "disagree", "modify", "dismiss"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => submitOverride(d)}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                  override === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          {(override === "modify" || override === "disagree") && (
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Justification (recorded to the immutable audit log)"
              className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
              rows={2}
            />
          )}
        </div>

        {/* 19. Evidence Sources trust panel */}
        {byKind.has("evidence_sources") && (
          <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mr-2 inline h-3 w-3" />
            {
              (byKind.get("evidence_sources")!.payload as SectionPayload<"evidence_sources">)
                .queried
            }{" "}
            queried ·{" "}
            {
              (byKind.get("evidence_sources")!.payload as SectionPayload<"evidence_sources">)
                .responded
            }{" "}
            responded ·{" "}
            {
              (byKind.get("evidence_sources")!.payload as SectionPayload<"evidence_sources">)
                .corroborated
            }{" "}
            corroborated
          </div>
        )}

        {/* 20. Next Intelligence Questions */}
        {byKind.has("next_questions") && (
          <Section title="Next Intelligence Questions">
            <div className="flex flex-wrap gap-2">
              {(
                byKind.get("next_questions")!.payload as SectionPayload<"next_questions">
              ).questions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Immutable footer required on every screen */}
      <footer className="border-t px-6 py-3 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </footer>
    </article>
  );
}

function ClassificationBanner({ briefing }: { briefing: Briefing }) {
  const m = briefing.classification.matrix;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {briefing.classification.typeBadge}
        </span>
        <span
          className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${tierClass(m.tier)}`}
        >
          Confidence: {m.tier} ({Math.round(m.composite * 100)}%)
        </span>
        <span className="rounded-md border px-2 py-1 text-xs capitalize text-muted-foreground">
          Evidence: {briefing.classification.evidenceStrength}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground">
        {briefing.latency_ms} ms · model: {briefing.model_used}
      </span>
    </header>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function GradeChip({ grade }: { grade: EvidenceGrade }) {
  const g = EVIDENCE_GRADES[grade];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase"
      style={{ color: g.color, borderColor: g.color }}
      title={`Weight ${g.weight}`}
    >
      {g.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: "immediate" | "today" | "monitor" | "archive" }) {
  const map = {
    immediate: "bg-red-500/15 text-red-700 dark:text-red-300",
    today: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    monitor: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
    archive: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${map[priority]}`}>
      {priority}
    </span>
  );
}

function tierClass(tier: "low" | "medium" | "high") {
  return tier === "high"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : tier === "medium"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-red-500/15 text-red-700 dark:text-red-300";
}
