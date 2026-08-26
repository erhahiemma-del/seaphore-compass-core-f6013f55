/**
 * The institutional context strip.
 *
 * The top bar already carried search, theme and an officer badge. What
 * it did not carry is the officer's *standing* in the institution — the
 * authority they hold, what is waiting for them, and the way back to
 * their own workspace. Those three answer "who am I here, and what do I
 * owe", which is the question that makes a national system feel like
 * somewhere a person works rather than a screen they visit.
 *
 * ## Everything here reads existing infrastructure
 *
 * Role comes from `useRoles`, which reads `public.user_roles` through
 * RLS. The unread count comes from `notification.store`, which already
 * derives it. The workspace link points at the existing `/workspace`
 * route backed by `workspace.store`. Nothing is introduced, and nothing
 * is counted here that is not already counted somewhere real.
 *
 * ## No fabricated counts
 *
 * The notification indicator renders only when the store actually holds
 * unread items. A zero is not decorated into a badge, and an absent
 * signal is not rendered as a reassuring one — an officer who learns
 * that the tray always shows something stops reading it.
 *
 * The Copilot is deliberately absent: `GlobalCopilotLauncher` already
 * mounts one entry point in the shell, and a second would be two things
 * to keep in step for no gain.
 */
import { Link } from "@tanstack/react-router";
import { Bell, Briefcase } from "lucide-react";

import { useRoles } from "@/hooks/use-permissions";
import { useNotificationStore } from "@/stores/notification.store";
import { cn } from "@/lib/utils";

/** Officer-facing name for each role. Authority, not a database value. */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  admin: "Administrator",
  supervisor: "Supervisor",
  officer: "Officer",
  analyst: "Analyst",
  viewer: "Observer",
};

export function InstitutionalContext({ className }: { className?: string }) {
  const { role } = useRoles();
  const unread = useNotificationStore((s) => s.unreadCount);

  return (
    <div className={cn("flex items-center gap-1.5", className)} data-testid="institutional-context">
      {/*
        Authority, when the institution has recorded one.
        Absent rather than "Unknown": a role we cannot read is not a role
        the officer lacks, and labelling it would assert the difference.
      */}
      {role ? (
        <span
          data-testid="officer-role"
          title="Your recorded authority in this institution"
          className="hidden rounded border border-line bg-surface-2 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate lg:inline-block"
        >
          {ROLE_LABEL[role] ?? role}
        </span>
      ) : null}

      <Link
        to="/workspace"
        data-testid="workspace-entry"
        title="Your operational workspace"
        className="flex h-8 w-8 items-center justify-center rounded text-slate transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Briefcase className="h-4 w-4" aria-hidden />
        <span className="sr-only">My workspace</span>
      </Link>

      <Link
        to="/alerts"
        data-testid="notification-entry"
        title={unread > 0 ? `${unread} unread` : "Alerts"}
        className="relative flex h-8 w-8 items-center justify-center rounded text-slate transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {/*
          Only when there genuinely is something. The count comes from
          the notification store's own derivation — this does not add up
          anything itself.
        */}
        {unread > 0 ? (
          <span
            data-testid="notification-unread"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-semibold text-white"
            style={{ backgroundColor: "var(--state-critical)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
        <span className="sr-only">{unread > 0 ? `${unread} unread alerts` : "Alerts"}</span>
      </Link>
    </div>
  );
}
