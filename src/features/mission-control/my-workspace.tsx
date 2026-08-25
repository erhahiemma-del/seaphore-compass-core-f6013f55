/**
 * My Workspace — one compact answer to "what belongs to me?".
 *
 * Presentation only. Every count is read from an existing client store
 * (screening queue, investigation selection, notification tray). Nothing is
 * fabricated: when a store is genuinely empty the row says so in words
 * rather than parading a zero as an operational metric.
 */
import { useMemo } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowRight, Bell, Gavel, ListChecks, Radar, Share2, type LucideIcon } from "lucide-react";

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
      className="group flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 motion-fast hover:border-[color:var(--ocean)]/60 hover:bg-surface-2"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--ocean-050)] text-[color:var(--ocean)]">
        <row.icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">{row.label}</span>
        <span className="block truncate type-small text-slate">{row.hint}</span>
      </span>
      {row.count === null ? (
        <span className="shrink-0 type-small text-slate">None open</span>
      ) : (
        <span className="type-mono shrink-0 text-[15px] font-bold text-foreground tabular-nums">
          {row.count}
        </span>
      )}
    </Link>
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

  const rows: readonly WorkRow[] = [
    {
      label: "Awaiting my decision",
      hint: "Screening entries flagged for review",
      to: "/decide",
      icon: Gavel,
      count: screening.counts.REVIEW > 0 ? screening.counts.REVIEW : null,
    },
    {
      label: "Approvals pending",
      hint: "Queued screening awaiting a run",
      to: "/decide/queue",
      icon: ListChecks,
      count: screening.counts.PENDING > 0 ? screening.counts.PENDING : null,
    },
    {
      label: "Confirmed matches",
      hint: "Screening hits requiring action",
      to: "/compliance",
      icon: Radar,
      count: screening.counts.HIT > 0 ? screening.counts.HIT : null,
    },
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
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <WorkRowItem key={row.label} row={row} />
        ))}
      </div>
    </PanelCard>
  );
}
