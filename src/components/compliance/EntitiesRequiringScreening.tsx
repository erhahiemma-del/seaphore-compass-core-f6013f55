/**
 * EntitiesRequiringScreening — live tracker card.
 *
 * Presentation-only component. Reads from the screening queue store and
 * dispatches per-entity screenings through the SANCTIONS capability. Each
 * row updates independently as its screening resolves.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Loader2,
  Plus,
  RefreshCw,
  Play,
  X,
  CircleAlert,
  FileDown,
} from "lucide-react";

import { exportComplianceReport } from "@/lib/compliance/export-compliance-report";

import { cn } from "@/lib/utils";
import {
  selectScreeningStats,
  useScreeningQueueStore,
  type ScreeningEntity,
  type ScreeningStatus,
} from "@/stores/screening-queue.store";
import { useWorkspaceStore } from "@/stores/workspace.store";

const STATUS_LABEL: Record<ScreeningStatus, string> = {
  PENDING: "Queued",
  RUNNING: "Screening…",
  CLEAR: "Clear",
  HIT: "Sanctions hit",
  REVIEW: "Review",
  ERROR: "Failed",
};

const STATUS_STYLE: Record<ScreeningStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-transparent",
  RUNNING: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-300",
  CLEAR: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-300",
  HIT: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-300",
  REVIEW: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  ERROR: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-300",
};

function StatusPill({ status }: { status: ScreeningStatus }) {
  const Icon =
    status === "RUNNING"
      ? Loader2
      : status === "CLEAR"
        ? ShieldCheck
        : status === "HIT"
          ? ShieldAlert
          : status === "REVIEW"
            ? ShieldQuestion
            : status === "ERROR"
              ? CircleAlert
              : ShieldQuestion;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        STATUS_STYLE[status],
      )}
    >
      <Icon className={cn("h-3 w-3", status === "RUNNING" && "animate-spin")} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export interface EntitiesRequiringScreeningProps {
  /** Seed entities on mount if the queue is empty (deduped by name+kind). */
  seed?: Array<{ name: string; kind?: ScreeningEntity["kind"]; imo?: string; origin?: string }>;
  /**
   * When true, also pulls entities from the active Investigation Workspace and
   * enqueues any that haven't been screened. Updates automatically as new
   * entities land in the workspace.
   */
  syncWithWorkspace?: boolean;
  className?: string;
}

export function EntitiesRequiringScreening({
  seed,
  syncWithWorkspace = true,
  className,
}: EntitiesRequiringScreeningProps) {
  const entities = useScreeningQueueStore((s) => s.entities);
  const order = useScreeningQueueStore((s) => s.order);
  const enqueue = useScreeningQueueStore((s) => s.enqueue);
  const remove = useScreeningQueueStore((s) => s.remove);
  const reset = useScreeningQueueStore((s) => s.reset);
  const runOne = useScreeningQueueStore((s) => s.runOne);
  const retry = useScreeningQueueStore((s) => s.retry);
  const runAllPending = useScreeningQueueStore((s) => s.runAllPending);
  const clearCompleted = useScreeningQueueStore((s) => s.clearCompleted);
  const stats = useScreeningQueueStore(selectScreeningStats);

  const activeId = useWorkspaceStore((s) => s.activeId);
  const workspaces = useWorkspaceStore((s) => s.investigations);
  const active = activeId ? workspaces[activeId] : undefined;

  // Seed once, only when the queue is empty.
  useEffect(() => {
    if (order.length > 0 || !seed || seed.length === 0) return;
    for (const s of seed) enqueue({ name: s.name, kind: s.kind, imo: s.imo, origin: s.origin });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live sync from workspace entities → screening queue.
  useEffect(() => {
    if (!syncWithWorkspace || !active) return;
    const existingNames = new Set(
      Object.values(entities).map((e) => `${e.kind ?? "?"}::${e.name.toLowerCase()}`),
    );
    for (const ent of active.entities) {
      const key = `${ent.type ?? "?"}::${ent.name.toLowerCase()}`;
      if (existingNames.has(key)) continue;
      enqueue({
        name: ent.name,
        kind: (ent.type as ScreeningEntity["kind"]) ?? undefined,
        origin: `workspace:${active.title}`,
      });
    }
  }, [active, entities, enqueue, syncWithWorkspace]);

  const rows = useMemo(
    () => order.map((id) => entities[id]).filter((e): e is ScreeningEntity => !!e),
    [order, entities],
  );

  const [newName, setNewName] = useState("");
  const submitAdd = () => {
    const t = newName.trim();
    if (!t) return;
    enqueue({ name: t, kind: /\bMV\b|\bIMO\b/i.test(t) ? "vessel" : "company", origin: "manual" });
    setNewName("");
  };

  return (
    <section
      className={cn(
        "rounded-lg border border-line/60 bg-surface-1",
        className,
      )}
      aria-live="polite"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 px-3 py-2">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
            Entities Requiring Screening
          </h3>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {stats.outstanding} outstanding · {stats.completed} completed
            {stats.counts.HIT > 0 ? ` · ${stats.counts.HIT} hit${stats.counts.HIT === 1 ? "" : "s"}` : ""}
            {stats.counts.REVIEW > 0 ? ` · ${stats.counts.REVIEW} review` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => runAllPending()}
            disabled={stats.outstanding === 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
              stats.outstanding === 0
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-accent",
            )}
          >
            <Play className="h-3 w-3" />
            Run all
          </button>
          <button
            type="button"
            onClick={clearCompleted}
            disabled={stats.completed === 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
              stats.completed === 0 ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
            )}
          >
            Clear completed
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                exportComplianceReport({
                  rows,
                  context: active?.title,
                });
              } catch (err) {
                console.error("Compliance report export failed", err);
              }
            }}
            disabled={rows.length === 0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
              rows.length === 0
                ? "cursor-not-allowed opacity-50"
                : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
            )}
            title="Export executive assessment + evidence summary as PDF"
          >
            <FileDown className="h-3 w-3" />
            Generate Compliance Report
          </button>
        </div>
      </header>

      {/* Progress strip */}
      <ProgressStrip stats={stats} />

      {/* Add row */}
      <div className="flex items-center gap-2 border-b border-line/50 px-3 py-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitAdd();
          }}
          placeholder="Add entity to screen (e.g. MV Ocean Pearl, Acme Shipping Ltd)"
          className="flex-1 rounded-md border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={submitAdd}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
        >
          <Plus className="h-3 w-3" />
          Queue
        </button>
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">
          No entities queued. Add one above or open an investigation to auto-populate.
        </div>
      ) : (
        <ul className="divide-y divide-line/50">
          {rows.map((e) => {
            const running = e.status === "RUNNING";
            const done = e.status === "CLEAR" || e.status === "HIT" || e.status === "REVIEW";
            return (
              <li key={e.id} className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[12px] font-medium">{e.name}</span>
                    {e.kind ? (
                      <span className="rounded border px-1 py-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {e.kind}
                      </span>
                    ) : null}
                    <StatusPill status={e.status} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {e.imo ? <span>IMO {e.imo}</span> : null}
                    {e.origin ? <span>· {e.origin}</span> : null}
                    {e.startedAt && running ? <span>· started {timeAgo(e.startedAt)}</span> : null}
                    {e.completedAt && done ? <span>· completed {timeAgo(e.completedAt)}</span> : null}
                    {typeof e.hitCount === "number" ? (
                      <span>· {e.hitCount} finding{e.hitCount === 1 ? "" : "s"}</span>
                    ) : null}
                  </div>
                  {e.summary ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">{e.summary}</div>
                  ) : null}
                  {e.error ? (
                    <div className="mt-1 text-[11px] text-red-500">{e.error}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {e.status === "PENDING" || e.status === "ERROR" ? (
                    <button
                      type="button"
                      onClick={() => void runOne(e.id)}
                      className="rounded-md border px-1.5 py-0.5 text-[10.5px] hover:bg-accent"
                      title="Screen now"
                    >
                      Screen
                    </button>
                  ) : null}
                  {done ? (
                    <button
                      type="button"
                      onClick={() => reset(e.id)}
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] hover:bg-accent"
                      title="Re-run screening"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Re-run
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                    aria-label={`Remove ${e.name}`}
                    disabled={running}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProgressStrip({
  stats,
}: {
  stats: ReturnType<typeof selectScreeningStats>;
}) {
  const total = Math.max(1, stats.total);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-1.5 w-full overflow-hidden bg-muted/40" aria-hidden="true">
      <span style={{ width: seg(stats.counts.CLEAR) }} className="bg-emerald-500" />
      <span style={{ width: seg(stats.counts.REVIEW) }} className="bg-amber-500" />
      <span style={{ width: seg(stats.counts.HIT) }} className="bg-red-500" />
      <span style={{ width: seg(stats.counts.ERROR) }} className="bg-red-700" />
      <span style={{ width: seg(stats.counts.RUNNING) }} className="animate-pulse bg-blue-500" />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
