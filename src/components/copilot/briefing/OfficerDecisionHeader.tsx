/**
 * SPRINT UX-003 — Officer Decision Intelligence Layer.
 *
 * Presentation-only composite rendered at the top of every Adaptive
 * Briefing. Its role is to transform the raw briefing (technical shape)
 * into an executive operational briefing:
 *
 *   1. Executive Assessment (synthesised when missing — never "insufficient evidence")
 *   2. Operational Recommendation
 *   3. Assessment Confidence (with plain-language reason)
 *   4. Evidence Completeness (progress bar + completed / pending / unavailable)
 *   5. Investigation Progress (live task tracker)
 *   6. Entities Requiring Screening
 *
 * No backend engine (OIE / ICE / IAL / Mission Builder / Connectors) is
 * touched. All data comes from the AdaptiveBriefing already produced by
 * the pipeline.
 */
import { AlertTriangle, CheckCircle2, Circle, MinusCircle, ShieldCheck } from "lucide-react";
import { SectionShell } from "./primitives";
import type { BriefingProfile, InvestigationTask } from "./profiles";
import type { AdaptiveBriefing } from "./types";

/* ─────────────── helpers ─────────────── */

function pct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

function confidenceTone(tier: AdaptiveBriefing["classification"]["tier"]) {
  if (tier === "high") return "text-emerald-700 bg-emerald-500/10 border-emerald-500/30";
  if (tier === "medium") return "text-amber-700 bg-amber-500/10 border-amber-500/30";
  return "text-red-700 bg-red-500/10 border-red-500/30";
}

function isInsufficient(b: AdaptiveBriefing): boolean {
  const c = b.classification.compositeConfidence ?? 0;
  const responded = b.evidenceSources?.responded ?? 0;
  return c <= 0 || responded === 0;
}

function subjectFromQuery(q: string): string {
  const m = q.match(/(MV|MT|SS)\s+[A-Z][\w\s-]*/i);
  return m?.[0].trim() ?? "the subject";
}

/** Synthesise an executive assessment when the pipeline could not. */
function synthesiseAssessment(b: AdaptiveBriefing): string {
  if (b.executive?.text?.trim()) return b.executive.text;
  const subject = subjectFromQuery(b.query);
  const queried = b.evidenceSources?.queried ?? 0;
  const responded = b.evidenceSources?.responded ?? 0;
  const topic = /sanction/i.test(b.query)
    ? "is sanctioned"
    : /risk/i.test(b.query)
      ? "carries elevated risk"
      : "warrants concern";
  return (
    `Current intelligence does not indicate that ${subject} ${topic}. ` +
    `The assessment remains preliminary because ${responded} of ${queried || "the required"} ` +
    `evidence sources ${responded === 1 ? "has" : "have"} completed successfully. ` +
    `Additional verification is recommended before making regulatory or commercial decisions.`
  );
}

/** Derive a plain-language reason for the current confidence tier. */
function confidenceReason(b: AdaptiveBriefing): string[] {
  const reasons: string[] = [];
  const queried = b.evidenceSources?.queried ?? 0;
  const responded = b.evidenceSources?.responded ?? 0;
  const corroborated = b.evidenceSources?.corroborated ?? 0;
  if (queried > 0 && responded < queried) {
    reasons.push(`Only ${responded} of ${queried} evidence sources have completed`);
  }
  if (corroborated > 0 && corroborated < responded) {
    reasons.push(
      `${corroborated} finding${corroborated === 1 ? "" : "s"} corroborated across sources`,
    );
  }
  for (const g of b.intelligenceGaps ?? []) reasons.push(g);
  if (reasons.length === 0) reasons.push("All completed sources agree on the current assessment.");
  return reasons.slice(0, 5);
}

/** Recommended next operational action (never uncertainty). */
function operationalRecommendation(b: AdaptiveBriefing, profile?: BriefingProfile): string {
  const custom = profile?.recommendation?.(b);
  if (custom) return custom;
  if (b.decisionRequired) return "Escalate for manual investigation.";
  const tier = b.classification.tier;
  const strength = b.classification.evidenceStrength;
  if (isInsufficient(b)) return "Continue evidence collection before making a decision.";
  if (tier === "high" && strength === "strong") return "Proceed with normal operations.";
  if (tier === "low" || strength === "weak") return "Suspend transaction pending verification.";
  return profile?.defaultRecommendation ?? "Initiate compliance review.";
}

/* ─────────────── Investigation Progress ─────────────── */

interface ProgressItem {
  key: string;
  label: string;
  match: RegExp;
}

const INVESTIGATION_TASKS: ProgressItem[] = [
  { key: "vessel", label: "Vessel identity", match: /vessel|imo\s*gisis|equasis|psix/i },
  { key: "registry", label: "Registry / flag", match: /registry|flag|companies house|cac/i },
  {
    key: "sanctions",
    label: "Sanctions screening",
    match: /sanction|opensanctions|ofac|un\s*sanc|eu\s*sanc/i,
  },
  { key: "ownership", label: "Beneficial ownership", match: /owner|beneficial|corporate/i },
  { key: "ais", label: "AIS history", match: /ais|position|track|spire|datalastic|marinetraffic/i },
  { key: "manifest", label: "Cargo manifest", match: /manifest|cargo|customs|volza/i },
  { key: "revenue", label: "Revenue exposure", match: /revenue|nimasa|levy|financial|platts/i },
  { key: "insurance", label: "Insurance / P&I", match: /insurance|p&i|club/i },
  { key: "weather", label: "Weather / conditions", match: /weather|copernicus|marine\s*weather/i },
];

function computeProgress(b: AdaptiveBriefing, tasks: InvestigationTask[]) {
  const haystack = [
    ...(b.evidence?.map((e) => e.source) ?? []),
    ...(b.evidenceSources?.detail?.map((d) => d.name) ?? []),
    ...(b.criticalFindings?.map((f) => f.source) ?? []),
  ]
    .join(" | ")
    .toLowerCase();
  const completed: InvestigationTask[] = [];
  const pending: InvestigationTask[] = [];
  for (const t of tasks) {
    if (t.match.test(haystack)) completed.push(t);
    else pending.push(t);
  }
  return { completed, pending };
}

/* ─────────────── Entities Requiring Screening ─────────────── */

const SCREENING_ROLES: Array<{ label: string; match: RegExp }> = [
  { label: "Vessel", match: /vessel|ship/i },
  { label: "Registered Owner", match: /registered\s*owner|owner/i },
  { label: "Beneficial Owner", match: /beneficial/i },
  { label: "Operator", match: /operator/i },
  { label: "Charterer", match: /charter/i },
  { label: "Cargo Consignee", match: /consignee|cargo/i },
  { label: "Port Agent", match: /port\s*agent|agent/i },
];

function computeScreening(b: AdaptiveBriefing) {
  const entities = b.entities ?? [];
  const hasVessel = entities.some((e) => e.type === "vessel");
  return SCREENING_ROLES.map((r) => {
    if (r.label === "Vessel") return { ...r, done: hasVessel };
    const done = entities.some((e) =>
      [e.role, e.type, e.name].some((s) => s && r.match.test(String(s))),
    );
    return { ...r, done };
  });
}

/* ─────────────── Component ─────────────── */

export function OfficerDecisionHeader({
  briefing,
  profile,
}: {
  briefing: AdaptiveBriefing;
  profile?: BriefingProfile;
}) {
  const assessment = synthesiseAssessment(briefing);
  const recommendation = operationalRecommendation(briefing, profile);
  const baseReasons = confidenceReason(briefing);
  const reasons =
    profile && profile.confidenceFactors.length > 0
      ? [...baseReasons, ...profile.confidenceFactors.map((f) => `Factor: ${f}`)].slice(0, 6)
      : baseReasons;
  const completeness =
    briefing.evidenceSources && briefing.evidenceSources.queried > 0
      ? briefing.evidenceSources.responded / briefing.evidenceSources.queried
      : 0;
  const tasks = profile?.investigationTasks ?? INVESTIGATION_TASKS;
  const { completed, pending } = computeProgress(briefing, tasks);
  const totalTasks = tasks.length;
  const progressPct = totalTasks > 0 ? pct(completed.length / totalTasks) : 0;
  const screening = computeScreening(briefing);
  const tierCls = confidenceTone(briefing.classification.tier);
  const tierLabel = briefing.classification.tier.toUpperCase();

  return (
    <div className="space-y-4">
      {/* Executive Assessment */}
      <SectionShell title="Executive Assessment" icon={<ShieldCheck className="h-4 w-4" />}>
        <p className="text-sm leading-relaxed text-foreground">{assessment}</p>
      </SectionShell>

      {/* Operational Recommendation */}
      <div className="rounded-md border-l-4 border-l-primary bg-primary/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Recommended Action
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{recommendation}</p>
      </div>

      {/* Assessment Confidence */}
      <SectionShell title="Assessment Confidence">
        <div className={`rounded-md border p-3 ${tierCls}`}>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold tracking-wider">{tierLabel}</span>
            <span className="text-xs opacity-80">
              {pct(briefing.classification.compositeConfidence)}% composite
            </span>
          </div>
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Because</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span aria-hidden>•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionShell>

      {/* Evidence Completeness */}
      {briefing.evidenceSources && briefing.evidenceSources.queried > 0 && (
        <SectionShell title="Evidence Completeness">
          <ProgressBar value={pct(completeness)} />
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
            <StatCol
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              label="Completed"
              value={String(briefing.evidenceSources.responded)}
            />
            <StatCol
              icon={<Circle className="h-3.5 w-3.5 text-amber-500" />}
              label="Pending"
              value={String(
                Math.max(0, briefing.evidenceSources.queried - briefing.evidenceSources.responded),
              )}
            />
            <StatCol
              icon={<MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />}
              label="Unavailable"
              value={String(
                (briefing.evidenceSources.detail ?? []).filter((d) => !d.responded).length,
              )}
            />
          </div>
        </SectionShell>
      )}

      {/* Investigation Progress */}
      <SectionShell title="Investigation Progress">
        <ProgressBar value={progressPct} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Completed
            </p>
            <ul className="space-y-0.5 text-xs">
              {completed.length === 0 && <li className="text-muted-foreground">None yet.</li>}
              {completed.map((t) => (
                <li key={t.key} className="flex items-center gap-1.5 text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {t.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pending
            </p>
            <ul className="space-y-0.5 text-xs">
              {pending.map((t) => (
                <li key={t.key} className="flex items-center gap-1.5 text-muted-foreground">
                  <Circle className="h-3.5 w-3.5" /> {t.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionShell>

      {/* Entities Requiring Screening */}
      <SectionShell
        title="Entities Requiring Screening"
        icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
      >
        <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
          {screening.map((e) => (
            <li key={e.label} className="flex items-center gap-1.5 rounded border px-2 py-1.5">
              {e.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={e.done ? "text-foreground" : "text-muted-foreground"}>
                {e.label}
              </span>
            </li>
          ))}
        </ul>
      </SectionShell>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="flex items-center gap-2"
    >
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-foreground">{value}%</span>
    </div>
  );
}

function StatCol({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
