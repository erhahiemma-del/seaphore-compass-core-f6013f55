/**
 * My Workspace — what this officer currently owns.
 *
 * Strictly a read-only aggregation over stores that already exist:
 * `workspace.store` (persisted investigations), `screening-queue.store`
 * (entities awaiting screening) and `notification.store` (unread
 * signals). It creates no task model, no assignment model and no queue
 * of its own — a parallel task system is the one thing this must not
 * become.
 *
 * ## Every number here is a length, not an estimate
 *
 * Each count is the size of a collection the officer can open and see.
 * Nothing is projected, forecast or rolled up, so a figure shown here
 * can always be reconciled against the surface behind it. Where a
 * collection is empty, that is stated plainly rather than dressed as a
 * zero-state achievement — an empty queue is a fact, not a
 * congratulation.
 *
 * ## Personalisation must not hide institutional obligation
 *
 * This summarises what the officer owns; it does not filter what the
 * institution shows. Mission Control's panels are unaffected by it, and
 * nothing here can suppress a critical signal from the national picture.
 * Emphasis is the only thing personalisation is permitted to change.
 */
import { Link } from "@tanstack/react-router";
import { Bell, FolderOpen, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/stores/notification.store";
import { useScreeningQueueStore } from "@/stores/screening-queue.store";
import { useWorkspaceStore } from "@/stores/workspace.store";

interface WorkRow {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly href: string;
  /** What the officer sees when the collection is empty. Never blank. */
  readonly emptyNote: string;
  readonly icon: typeof FolderOpen;
}

export function MyWorkspaceSummary({ className }: { className?: string }) {
  /*
   * Sizes of real collections.
   *
   * Read with narrow selectors so this re-renders when a count changes
   * and not when unrelated store state does.
   */
  const investigationCount = useWorkspaceStore((s) => Object.keys(s.investigations).length);
  const screeningCount = useScreeningQueueStore((s) => Object.keys(s.entities).length);
  const unread = useNotificationStore((s) => s.unreadCount);

  const rows: readonly WorkRow[] = [
    {
      id: "investigations",
      label: "Saved investigations",
      count: investigationCount,
      href: "/workspace",
      emptyNote: "No investigation has been opened on this device.",
      icon: FolderOpen,
    },
    {
      id: "screening",
      label: "Entities awaiting screening",
      count: screeningCount,
      href: "/compliance",
      emptyNote: "Nothing is queued for screening.",
      icon: ShieldQuestion,
    },
    {
      id: "alerts",
      label: "Unread signals",
      count: unread,
      href: "/alerts",
      emptyNote: "No unread signals.",
      icon: Bell,
    },
  ];

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section
      data-testid="my-workspace-summary"
      aria-label="My workspace"
      className={cn("rounded-md border border-line bg-surface", className)}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="type-label text-foreground">My workspace</h2>
        {/*
          A plain statement, not a greeting. "3 matters require your
          attention" is only true if they do; when nothing is
          outstanding the honest line says so rather than manufacturing
          urgency to look useful.
        */}
        <span data-testid="workspace-headline" className="type-small text-slate">
          {total > 0
            ? `${total} item${total === 1 ? "" : "s"} in your working set`
            : "Nothing currently assigned to you here"}
        </span>
      </header>

      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const Icon = row.icon;
          const empty = row.count === 0;
          return (
            <li key={row.id}>
              <Link
                to={row.href}
                data-testid={`workspace-row-${row.id}`}
                className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                  {row.label}
                </span>
                {empty ? (
                  <span className="shrink-0 text-[10.5px] text-slate">{row.emptyNote}</span>
                ) : (
                  <span
                    data-testid={`workspace-count-${row.id}`}
                    className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground"
                  >
                    {row.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line px-3 py-1.5 text-[10px] leading-relaxed text-slate">
        Counts are the size of collections held on this device. Institution-wide assignment and
        approval queues arrive with the workflow phase.
      </p>
    </section>
  );
}
