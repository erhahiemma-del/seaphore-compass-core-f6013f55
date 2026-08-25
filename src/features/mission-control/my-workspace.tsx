/**
 * My Workspace — one consolidated officer surface.
 *
 * Presentation only. Active workflows, decisions, approvals, handoffs,
 * blockers and recent work are grouped as compact sub-panels inside a
 * single card rather than several full-width dashboard sections. Every
 * count is read from an existing client store; when a store is genuinely
 * empty the row says so in words rather than parading a zero as an
 * operational metric.
 */
import { useMemo } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  CircleSlash,
  Gavel,
  ListChecks,
  Radar,
  Share2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { PanelCard } from "@/components/panel-card";
import { selectScreeningStats, useScreeningQueueStore } from "@/stores/screening-queue.store";
import { useNotificationStore } from "@/stores/notification.store";
import { useInvestigationStore } from "@/stores/investigation.store";

interface WorkRow {
  readonly label: string;
  readonly hint: string;
  readonly to: LinkProps["to"];
  readonly icon: LucideIcon;
  /** Null means the surface has nothing to report — never rendered as 0. */
  readonly count: number | null;
}

function WorkRowItem({ row }: { row: WorkRow }) {
  return (
    <Link
      to={row.to}
      className="group flex items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 motion-fast hover:-translate-y-px hover:border-[color:var(--ocean)]/60 hover:bg-surface-2 hover:shadow-card"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--ocean-050)] text-[color:var(--ocean)]">
        <row.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-foreground">
          {row.label}
        </span>
        <span className="block truncate text-[11px] text-slate">{row.hint}</span>
      </span>
      {row.count === null ? (
        <span className="shrink-0 text-[11px] text-slate">None</span>
      ) : (
        <span className="type-mono shrink-0 text-[14px] font-bold text-foreground tabular-nums">
          {row.count}
        </span>
      )}
    </Link>
  );
}

function SubPanel({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly WorkRow[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <WorkRowItem key={row.label} row={row} />
        ))}
      </div>
    </div>
  );
}

export function MyWorkspacePanel() {
  // Snapshot-stable selection: `selectScreeningStats` builds a fresh object,
  // so it is derived in a memo rather than used as the store selector.
  const entities = useScreeningQueueStore((s) => s.entities);
  const order = useScreeningQueueStore((s) => s.order);
  const screening = useMemo(
    () => selectScreeningStats({ entities, order } as Parameters<typeof selectScreeningStats>[0]),
    [entities, order],
  );
  const unread = useNotificationStore((s) => s.unreadCount);
  const activeCase = useInvestigationStore((s) => s.activeInvestigationId);

  const workflows: readonly WorkRow[] = [
    {
      label: "Active workflows",
      hint: "Cases in progress",
      to: "/investigate",
      icon: Workflow,
      count: activeCase ? 1 : null,
    },
    {
      label: "Awaiting my decision",
      hint: "Screening flagged for review",
      to: "/decide",
      icon: Gavel,
      count: screening.counts.REVIEW > 0 ? screening.counts.REVIEW : null,
    },
  ];

  const approvals: readonly WorkRow[] = [
    {
      label: "Approvals pending",
      hint: "Queued awaiting a run",
      to: "/decide/queue",
      icon: ListChecks,
      count: screening.counts.PENDING > 0 ? screening.counts.PENDING : null,
    },
    {
      label: "Confirmed matches",
      hint: "Screening hits to action",
      to: "/compliance",
      icon: Radar,
      count: screening.counts.HIT > 0 ? screening.counts.HIT : null,
    },
  ];

  const handoffs: readonly WorkRow[] = [
    {
      label: "Handoffs",
      hint: "Ready to assign",
      to: "/share/queue",
      icon: Users,
      count: null,
    },
    {
      label: "Blockers",
      hint: "Blocked by dependencies",
      to: "/decide/queue",
      icon: CircleSlash,
      count: null,
    },
  ];

  const recent: readonly WorkRow[] = [
    {
      label: "Unread notifications",
      hint: "Alerts routed to you",
      to: "/alerts",
      icon: Bell,
      count: unread > 0 ? unread : null,
    },
    {
      label: "Briefings to share",
      hint: "Share queue",
      to: "/share/queue",
      icon: Share2,
      count: null,
    },
  ];

  return (
    <PanelCard className="flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="type-h1 text-foreground">My Workspace</h2>
          <p className="type-small text-slate">
            {activeCase
              ? `Open case · ${activeCase}`
              : "No case open — Mission Control is the national picture"}
          </p>
        </div>
        <Link
          to="/investigate"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[color:var(--ocean)] hover:underline"
        >
          Open workspace <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SubPanel title="Workflows & decisions" rows={workflows} />
        <SubPanel title="Approvals" rows={approvals} />
        <SubPanel title="Handoffs & blockers" rows={handoffs} />
        <SubPanel title="Recent work" rows={recent} />
      </div>
    </PanelCard>
  );
}
