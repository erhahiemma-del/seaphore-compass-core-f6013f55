/**
 * /workspace/$id — Intelligence Investigation Workspace (IIW).
 *
 * Sprint UX-005. Six-panel operational workspace over persistent state.
 * Presentation + persistence only — no OIE/ICE/IAL/Connector/KG changes.
 */
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  FileSearch,
  FlaskConical,
  Gauge,
  ListChecks,
  MessageSquareText,
  Network,
  PauseCircle,
  ScrollText,
  Sparkles,
  TimerReset,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useWorkspaceStore,
  type EvidenceCategory,
  type HypothesisStatus,
  type InvestigationWorkspace,
  type TaskStatus,
  type TimelineEvent,
} from "@/stores/workspace.store";

export const Route = createFileRoute("/workspace/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Investigation ${params.id.slice(-6)} — Seaphore Workspace` },
      { name: "description", content: "Persistent maritime investigation workspace: evidence, hypotheses, tasks, decisions, timeline and entities." },
      { property: "og:title", content: "Seaphore Investigation Workspace" },
      { property: "og:description", content: "Evidence first. Explainable always. Officer decides." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ params }) => {
    const state = useWorkspaceStore.getState();
    if (!state.investigations[params.id]) throw notFound();
    return { id: params.id };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="p-10 text-center text-sm text-muted-foreground">
        Investigation not found. <Link to="/workspace" className="underline">Back to workspaces</Link>.
      </div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="p-10 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "Workspace failed to load."}
      </div>
    </AppShell>
  ),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { id } = Route.useParams();
  const router = useRouter();
  const w = useWorkspaceStore((s) => s.investigations[id] ?? null);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const remove = useWorkspaceStore((s) => s.removeInvestigation);

  // Make this the active workspace whenever it opens.
  useMemo(() => {
    if (w && useWorkspaceStore.getState().activeId !== id) setActive(id);
  }, [id, w, setActive]);

  if (!w) return null;

  return (
    <AppShell>
      <div className="flex h-full min-h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Link to="/workspace" className="rounded p-1 hover:bg-accent">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Investigation Workspace
              </div>
              <div className="text-sm font-semibold">{w.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/copilot"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <MessageSquareText className="h-3.5 w-3.5" /> Continue in Copilot
            </Link>
            <Button size="sm" variant="outline" onClick={() => exportInvestigation(w)}>
              <Download className="mr-1 h-3.5 w-3.5" /> Export
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Delete this investigation?")) {
                  remove(id);
                  router.navigate({ to: "/workspace" });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-3">
          {/* Column 1: Mission overview + Hypotheses + Entities */}
          <div className="space-y-4">
            <MissionOverviewPanel w={w} />
            <HypothesisPanel w={w} />
            <EntityPanel w={w} />
          </div>

          {/* Column 2: Evidence + Tasks */}
          <div className="space-y-4">
            <EvidencePanel w={w} />
            <TaskPanel w={w} />
          </div>

          {/* Column 3: Decision log + Timeline + Conversation */}
          <div className="space-y-4">
            <RecommendationPanel w={w} />
            <DecisionLogPanel w={w} />
            <TimelinePanel w={w} />
            <ConversationPanel w={w} />
          </div>
        </div>

        <footer className="border-t bg-background/60 px-4 py-2 text-center text-[11px] text-muted-foreground">
          Evidence first. Explainable always. Officer decides.
        </footer>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────────────────────────────────

function Panel({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider">{title}</div>
            {subtitle ? <div className="text-[11px] text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function MissionOverviewPanel({ w }: { w: InvestigationWorkspace }) {
  const update = useWorkspaceStore((s) => s.updateOverview);
  return (
    <Panel icon={Gauge} title="Mission overview" subtitle={w.missionType.replace(/_/g, " ")}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Field label="Status">
          <select
            value={w.status}
            onChange={(e) => update(w.id, { status: e.target.value as InvestigationWorkspace["status"] })}
            className="w-full rounded border bg-background px-1.5 py-0.5 text-xs"
          >
            {["ACTIVE", "MONITORING", "SUSPENDED", "CLOSED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            value={w.priority}
            onChange={(e) => update(w.id, { priority: e.target.value as InvestigationWorkspace["priority"] })}
            className="w-full rounded border bg-background px-1.5 py-0.5 text-xs"
          >
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Officer">{w.officer}</Field>
        <Field label="Started">{new Date(w.startedAt).toLocaleString()}</Field>
        <Field label="Updated">{new Date(w.updatedAt).toLocaleString()}</Field>
        <Field label="Confidence">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
              w.confidenceTier === "HIGH" && "bg-emerald-500/10 text-emerald-700",
              w.confidenceTier === "MEDIUM" && "bg-amber-500/10 text-amber-700",
              w.confidenceTier === "LOW" && "bg-rose-500/10 text-rose-700",
            )}
          >
            {w.confidenceTier} · {w.confidencePct}%
          </span>
        </Field>
      </dl>
      <div className="mt-3 space-y-2">
        <ProgressBar label="Evidence completeness" value={w.evidenceCompleteness} />
        <ProgressBar label="Investigation progress" value={w.progress} />
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded bg-muted">
        <div className="h-full rounded bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Evidence ────────────────────────────────────────────────────────────────

function EvidencePanel({ w }: { w: InvestigationWorkspace }) {
  const move = useWorkspaceStore((s) => s.moveEvidence);
  const add = useWorkspaceStore((s) => s.addEvidence);
  const [cat, setCat] = useState<EvidenceCategory>("COLLECTED");
  const items = w.evidence.filter((e) => e.category === cat);
  const counts: Record<EvidenceCategory, number> = {
    COLLECTED: 0,
    PENDING: 0,
    CONFLICTING: 0,
    REJECTED: 0,
  };
  for (const e of w.evidence) counts[e.category]++;

  return (
    <Panel
      icon={FileSearch}
      title="Evidence board"
      subtitle={`${w.evidence.length} items`}
      action={
        <button
          className="text-[11px] text-primary hover:underline"
          onClick={() => {
            const title = window.prompt("Evidence title?");
            if (!title) return;
            const source = window.prompt("Source?") ?? "Officer note";
            add(w.id, { title, source, category: "COLLECTED", grade: "OBSERVED" });
          }}
        >
          + Add
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(counts) as EvidenceCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px]",
              cat === c ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {c} · {counts[c]}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          No {cat.toLowerCase()} evidence.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((e) => (
            <li key={e.id} className="rounded border p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    <span>{e.source}</span>
                    {e.grade ? <span>· {e.grade}</span> : null}
                    <span>· {new Date(e.collectedAt).toLocaleTimeString()}</span>
                  </div>
                  {e.summary ? <div className="mt-1 text-[11px] text-muted-foreground">{e.summary}</div> : null}
                </div>
                <select
                  value={e.category}
                  onChange={(ev) => move(w.id, e.id, ev.target.value as EvidenceCategory)}
                  className="rounded border bg-background px-1 py-0.5 text-[10px]"
                >
                  {(["COLLECTED", "PENDING", "CONFLICTING", "REJECTED"] as EvidenceCategory[]).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Hypothesis ──────────────────────────────────────────────────────────────

const H_STATUSES: HypothesisStatus[] = [
  "UNDER_REVIEW",
  "SUPPORTED",
  "CONTRADICTED",
  "CONFIRMED",
  "REJECTED",
  "RETIRED",
];

function HypothesisPanel({ w }: { w: InvestigationWorkspace }) {
  const add = useWorkspaceStore((s) => s.addHypothesis);
  const update = useWorkspaceStore((s) => s.updateHypothesis);
  return (
    <Panel
      icon={FlaskConical}
      title="Hypothesis tracker"
      subtitle={`${w.hypotheses.length} working`}
      action={
        <button
          className="text-[11px] text-primary hover:underline"
          onClick={() => {
            const s = window.prompt("Hypothesis statement?");
            if (s) add(w.id, s);
          }}
        >
          + New
        </button>
      }
    >
      {w.hypotheses.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          No hypotheses yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {w.hypotheses.map((h) => (
            <li key={h.id} className="rounded border p-2 text-xs">
              <div className="font-medium">{h.statement}</div>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={h.status}
                  onChange={(e) => update(w.id, h.id, { status: e.target.value as HypothesisStatus })}
                  className="rounded border bg-background px-1 py-0.5 text-[10px]"
                >
                  {H_STATUSES.map((s) => (
                    <option key={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <span className="text-[10px] text-muted-foreground">
                  Confidence {h.confidence}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={h.confidence}
                  onChange={(e) => update(w.id, h.id, { confidence: Number(e.target.value) })}
                  className="flex-1"
                />
              </div>
              {h.history.length > 1 ? (
                <details className="mt-1 text-[10px] text-muted-foreground">
                  <summary>History ({h.history.length})</summary>
                  <ul className="ml-3 mt-1 list-disc">
                    {h.history.slice(-5).map((x, i) => (
                      <li key={i}>{new Date(x.at).toLocaleString()} — {x.note}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Tasks ───────────────────────────────────────────────────────────────────

function TaskPanel({ w }: { w: InvestigationWorkspace }) {
  const update = useWorkspaceStore((s) => s.updateTask);
  const add = useWorkspaceStore((s) => s.addTask);
  return (
    <Panel
      icon={ListChecks}
      title="Operational tasks"
      subtitle={`${w.tasks.filter((t) => t.status !== "COMPLETED").length} open`}
      action={
        <button
          className="text-[11px] text-primary hover:underline"
          onClick={() => {
            const t = window.prompt("Task title?");
            if (t) add(w.id, { title: t, priority: "MEDIUM", owner: "Officer" });
          }}
        >
          + New
        </button>
      }
    >
      {w.tasks.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          No tasks yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {w.tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded border p-2 text-xs">
              <button
                onClick={() =>
                  update(w.id, t.id, {
                    status: t.status === "COMPLETED" ? "PENDING" : "COMPLETED",
                  })
                }
                className="mt-0.5 text-muted-foreground hover:text-primary"
                aria-label="Toggle complete"
              >
                {t.status === "COMPLETED" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate font-medium",
                    t.status === "COMPLETED" && "text-muted-foreground line-through",
                  )}
                >
                  {t.title}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span>{t.priority}</span>
                  {t.owner ? <span>· {t.owner}</span> : null}
                  <span>· {t.status.replace(/_/g, " ")}</span>
                </div>
              </div>
              <select
                value={t.status}
                onChange={(e) => update(w.id, t.id, { status: e.target.value as TaskStatus })}
                className="rounded border bg-background px-1 py-0.5 text-[10px]"
              >
                {(["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"] as TaskStatus[]).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Decisions ───────────────────────────────────────────────────────────────

function DecisionLogPanel({ w }: { w: InvestigationWorkspace }) {
  const add = useWorkspaceStore((s) => s.addDecision);
  return (
    <Panel
      icon={ScrollText}
      title="Decision log"
      subtitle={`${w.decisions.length} entries · immutable audit trail`}
      action={
        <button
          className="text-[11px] text-primary hover:underline"
          onClick={() => {
            const title = window.prompt("Decision title?");
            if (!title) return;
            const detail = window.prompt("Detail?") ?? undefined;
            add(w.id, { title, detail, officer: w.officer });
          }}
        >
          + Log
        </button>
      }
    >
      <ol className="space-y-1.5">
        {[...w.decisions]
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .map((d) => (
            <li key={d.id} className="rounded border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{d.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(d.at).toLocaleTimeString()}
                </span>
              </div>
              {d.detail ? <div className="mt-0.5 text-[11px] text-muted-foreground">{d.detail}</div> : null}
            </li>
          ))}
      </ol>
    </Panel>
  );
}

// Timeline ────────────────────────────────────────────────────────────────

const TIMELINE_ICON: Record<TimelineEvent["kind"], React.ComponentType<{ className?: string }>> = {
  question: MessageSquareText,
  briefing: Sparkles,
  evidence: FileSearch,
  connector: Network,
  report: ScrollText,
  task: ListChecks,
  decision: CheckCircle2,
  recommendation: Wand2,
  hypothesis: FlaskConical,
  conflict: XCircle,
};

function TimelinePanel({ w }: { w: InvestigationWorkspace }) {
  const [q, setQ] = useState("");
  const items = [...w.timeline]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .filter((e) => (q ? (e.label + " " + (e.detail ?? "")).toLowerCase().includes(q.toLowerCase()) : true));
  return (
    <Panel
      icon={TimerReset}
      title="Investigation timeline"
      subtitle={`${w.timeline.length} events`}
      action={
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="w-24 rounded border bg-background px-1.5 py-0.5 text-[11px]"
        />
      }
    >
      <ol className="max-h-[24rem] space-y-1 overflow-auto pr-1">
        {items.map((e) => {
          const Icon = TIMELINE_ICON[e.kind] ?? Circle;
          return (
            <li key={e.id} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{e.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(e.at).toLocaleString()} · {e.kind}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

// Entity workspace ────────────────────────────────────────────────────────

function EntityPanel({ w }: { w: InvestigationWorkspace }) {
  return (
    <Panel icon={Network} title="Entity workspace" subtitle={`${w.entities.length} entities`}>
      {w.entities.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          No entities resolved yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {w.entities.map((e) => (
            <li key={e.id} className="rounded border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.type}
                    {e.role ? ` · ${e.role}` : ""}
                  </div>
                </div>
                {e.riskTier ? (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      e.riskTier === "critical" && "bg-rose-500/10 text-rose-700",
                      e.riskTier === "high" && "bg-orange-500/10 text-orange-700",
                      e.riskTier === "medium" && "bg-amber-500/10 text-amber-700",
                      e.riskTier === "low" && "bg-emerald-500/10 text-emerald-700",
                    )}
                  >
                    {e.riskTier}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {e.evidenceIds.length} evidence · {e.relatedTo.length} relationships
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Recommendation ──────────────────────────────────────────────────────────

function RecommendationPanel({ w }: { w: InvestigationWorkspace }) {
  const set = useWorkspaceStore((s) => s.setRecommendation);
  const rec = w.recommendation;
  const suggest = ["Proceed", "Escalate", "Monitor", "Suspend", "Inspect", "Approve", "Reject"];
  return (
    <Panel
      icon={Wand2}
      title="Recommended decision"
      subtitle={rec ? "Supported by evidence below" : "Awaiting briefing"}
    >
      {rec ? (
        <div className="rounded border bg-primary/5 p-2 text-xs">
          <div className="font-semibold text-primary">{rec.label}</div>
          {rec.rationale ? <div className="mt-1 text-muted-foreground">{rec.rationale}</div> : null}
          <div className="mt-1 text-[10px] text-muted-foreground">
            {rec.supportingEvidence?.length ?? 0} supporting evidence items
          </div>
        </div>
      ) : (
        <div className="rounded border border-dashed p-2 text-[11px] text-muted-foreground">
          No system recommendation yet. Officer decides.
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {suggest.map((s) => (
          <button
            key={s}
            onClick={() =>
              set(w.id, {
                id: `officer_${Date.now()}`,
                label: s,
                supportingEvidence: w.evidence.filter((e) => e.category === "COLLECTED").map((e) => e.id),
              })
            }
            className="rounded border px-2 py-0.5 text-[11px] hover:bg-accent"
          >
            {s}
          </button>
        ))}
      </div>
    </Panel>
  );
}

// Conversation snapshot ───────────────────────────────────────────────────

function ConversationPanel({ w }: { w: InvestigationWorkspace }) {
  return (
    <Panel
      icon={MessageSquareText}
      title="Conversation"
      subtitle={`${w.conversationTurns.length} turns — full context in Copilot`}
      action={
        <Link to="/copilot" className="text-[11px] text-primary hover:underline">
          Open Copilot
        </Link>
      }
    >
      {w.conversationTurns.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          No exchanges yet.
        </div>
      ) : (
        <ol className="max-h-56 space-y-1 overflow-auto pr-1 text-[11px]">
          {w.conversationTurns.slice(-20).map((t) => (
            <li key={t.id}>
              <span
                className={cn(
                  "mr-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase",
                  t.role === "officer" ? "bg-primary/10 text-primary" : "bg-muted",
                )}
              >
                {t.role}
              </span>
              <span className="text-foreground">{t.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// Export ──────────────────────────────────────────────────────────────────

function exportInvestigation(w: InvestigationWorkspace) {
  const payload = {
    exportedAt: new Date().toISOString(),
    mission: {
      id: w.id,
      title: w.title,
      missionType: w.missionType,
      priority: w.priority,
      status: w.status,
      officer: w.officer,
      startedAt: w.startedAt,
      updatedAt: w.updatedAt,
      confidence: { tier: w.confidenceTier, pct: w.confidencePct },
      evidenceCompleteness: w.evidenceCompleteness,
      progress: w.progress,
    },
    evidence: w.evidence,
    hypotheses: w.hypotheses,
    timeline: w.timeline,
    tasks: w.tasks,
    decisions: w.decisions,
    entities: w.entities,
    recommendation: w.recommendation,
    appendices: {
      conversation: w.conversationTurns,
      footer: "Evidence first. Explainable always. Officer decides.",
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seaphore-investigation-${w.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Silence unused-import lints for icons only referenced conditionally.
export const _unused = { PauseCircle };
