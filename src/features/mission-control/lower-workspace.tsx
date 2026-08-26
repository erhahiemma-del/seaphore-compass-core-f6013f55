/**
 * The lower operational workspace — four columns, one question each.
 *
 *   My Workspace          what this officer is carrying
 *   Decisions & Approvals what is waiting on a decision
 *   Handoffs & Blockers   what is waiting on somebody else
 *   Recent Work           what was touched, and when
 *
 * ## Every figure is a length or a ratio, never an estimate
 *
 * All four read `workspace.store`, which already holds the officer's
 * investigations, their tasks and their recorded decisions. Nothing here
 * projects, forecasts or rolls up: each number is the size of a
 * collection the officer can open and count for themselves, so a figure
 * shown here can always be reconciled against the surface behind it.
 *
 * ## What the approved design shows that the data cannot
 *
 * The reference composition shows rows like "Vessel Clearance ·
 * VOY-2398-LAG · Stage 4/7 · 2h · High". Three of those five are real:
 * the title, the priority, and a stage ratio derived from how many of an
 * investigation's tasks are complete. The other two are not — there is
 * no SLA clock and no per-stage deadline model in this application, so
 * the "2h" column is absent rather than filled with a plausible number.
 *
 * That is the whole discipline here: the composition stays intact so it
 * is ready when a deadline model exists, and the column stays empty
 * until it does. An invented duration on a clearance queue is the kind
 * of number an officer would plan a shift around.
 *
 * ## Empty is a fact, not an achievement
 *
 * An empty queue is reported plainly. Dressing it as a zero-state
 * congratulation ("All clear!") teaches officers that the panel is
 * decorative, and the one time it matters they will not read it.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckSquare, Clock, FolderOpen, PauseCircle } from "lucide-react";

import { PanelCard } from "@/components/panel-card";
import { cn } from "@/lib/utils";
import { useWorkspaceStore, type InvestigationWorkspace } from "@/stores/workspace.store";

/* ── shared chrome ─────────────────────────────────────────────── */

function ColumnHeader({ title, to, label }: { title: string; to: string; label: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="type-label text-slate">{title}</h2>
      <Link
        to={to}
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[color:var(--ocean)] hover:underline"
      >
        {label} <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

/** What the officer sees instead of a row. Never blank, never cheerful. */
function EmptyNote({ children }: { children: string }) {
  return (
    <p data-testid="workspace-empty-note" className="type-small px-1 py-3 text-slate">
      {children}
    </p>
  );
}

const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: "text-[color:var(--status-critical)] bg-[color:var(--status-critical-tint)]",
  HIGH: "text-[color:var(--status-review)] bg-[color:var(--status-review-tint)]",
  MEDIUM: "text-[color:var(--status-active)] bg-[color:var(--status-active-tint)]",
  LOW: "text-[color:var(--status-inactive)] bg-[color:var(--status-inactive-tint)]",
};

/** Completed tasks over total. Absent when the case has no tasks at all. */
function stageRatio(investigation: InvestigationWorkspace): string | null {
  const total = investigation.tasks.length;
  if (total === 0) return null;
  const done = investigation.tasks.filter((t) => t.status === "COMPLETED").length;
  return `${done}/${total}`;
}

function useInvestigations(): InvestigationWorkspace[] {
  const byId = useWorkspaceStore((s) => s.investigations);
  return Object.values(byId);
}

/* ── 1. My Workspace ───────────────────────────────────────────── */

export function MyWorkspacePanel() {
  const investigations = useInvestigations();
  const rows = [...investigations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <PanelCard className="flex flex-col" data-testid="panel-my-workspace">
      <ColumnHeader title="My Workspace" to="/workspace" label="View all" />
      {rows.length === 0 ? (
        <EmptyNote>No open work. Cases you start or are assigned appear here.</EmptyNote>
      ) : (
        <ul className="divide-y divide-[color:var(--line-soft)]">
          {rows.slice(0, 5).map((row) => {
            const stage = stageRatio(row);
            return (
              <li key={row.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="type-small truncate font-semibold text-foreground">
                    {row.title}
                  </div>
                  <div className="type-mono truncate text-[10.5px] text-slate">{row.id}</div>
                </div>
                {/* Only when the case actually has tasks to be a stage of. */}
                {stage && (
                  <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-slate">
                    Stage {stage}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    PRIORITY_TONE[row.priority] ?? PRIORITY_TONE.LOW,
                  )}
                >
                  {row.priority}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}

/* ── 2 & 3. Counted rows ───────────────────────────────────────── */

interface CountRow {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly count: number;
  readonly icon: typeof CheckSquare;
}

function CountList({ rows, empty }: { rows: readonly CountRow[]; empty: string }) {
  // Zero is a real answer here, so rows are shown even at zero — the
  // panel is reporting on collections that exist. The empty note is for
  // when there is nothing to report on at all.
  if (rows.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ul className="divide-y divide-[color:var(--line-soft)]">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <li key={row.id} className="flex items-center gap-2.5 py-2">
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="type-small font-semibold text-foreground">{row.label}</div>
              <div className="type-small truncate text-slate">{row.detail}</div>
            </div>
            <span className="type-h1 shrink-0 tabular-nums text-foreground">{row.count}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function DecisionsApprovalsPanel() {
  const investigations = useInvestigations();
  const tasks = investigations.flatMap((i) => i.tasks);
  const decisions = investigations.flatMap((i) => i.decisions);

  const rows: CountRow[] = [
    {
      id: "awaiting",
      label: "Awaiting my decision",
      detail: "Tasks open on cases in this workspace",
      count: tasks.filter((t) => t.status === "PENDING").length,
      icon: CheckSquare,
    },
    {
      id: "in-progress",
      label: "In progress",
      detail: "Started and not yet closed",
      count: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      icon: Clock,
    },
    {
      id: "recorded",
      label: "Decisions recorded",
      detail: "Officer decisions written to the case record",
      count: decisions.length,
      icon: FolderOpen,
    },
  ];

  return (
    <PanelCard className="flex flex-col" data-testid="panel-decisions-approvals">
      <ColumnHeader title="Decisions & Approvals" to="/decide" label="View all" />
      <CountList
        rows={investigations.length === 0 ? [] : rows}
        empty="No cases open to decide on."
      />
    </PanelCard>
  );
}

export function HandoffsBlockersPanel() {
  const investigations = useInvestigations();
  const tasks = investigations.flatMap((i) => i.tasks);

  const rows: CountRow[] = [
    {
      id: "blocked",
      label: "Blocked items",
      detail: "Work the case itself records as blocked",
      count: tasks.filter((t) => t.status === "BLOCKED").length,
      icon: PauseCircle,
    },
    {
      id: "waiting",
      label: "Waiting on dependencies",
      detail: "Tasks that name something they are waiting for",
      count: tasks.filter((t) => (t.dependencies?.length ?? 0) > 0).length,
      icon: Clock,
    },
    {
      id: "assigned-out",
      label: "Assigned to someone else",
      detail: "Open tasks with an owner recorded",
      count: tasks.filter((t) => t.owner && t.status !== "COMPLETED").length,
      icon: ArrowRight,
    },
  ];

  return (
    <PanelCard className="flex flex-col" data-testid="panel-handoffs-blockers">
      <ColumnHeader title="Handoffs & Blockers" to="/decide" label="View all" />
      <CountList
        rows={investigations.length === 0 ? [] : rows}
        empty="Nothing handed off or blocked."
      />
    </PanelCard>
  );
}

/* ── 4. Recent Work ────────────────────────────────────────────── */

/**
 * Relative time, from a timestamp the store recorded.
 *
 * Formatted, not estimated — the difference between two real instants.
 */
function since(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function RecentWorkPanel({ now = Date.now() }: { readonly now?: number }) {
  const investigations = useInvestigations();
  const rows = [...investigations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  return (
    <PanelCard className="flex flex-col" data-testid="panel-recent-work">
      <ColumnHeader title="Recent Work" to="/memory" label="View all" />
      {rows.length === 0 ? (
        <EmptyNote>Nothing touched yet in this workspace.</EmptyNote>
      ) : (
        <ul className="divide-y divide-[color:var(--line-soft)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 py-2">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate" aria-hidden />
              <span className="type-small min-w-0 flex-1 truncate text-foreground">
                {row.title}
              </span>
              <span className="type-small shrink-0 tabular-nums text-slate">
                {since(row.updatedAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
