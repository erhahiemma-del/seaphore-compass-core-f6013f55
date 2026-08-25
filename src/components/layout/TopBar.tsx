import { useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, LogIn, LogOut, Search, ShieldCheck, User2 } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { useAuth } from "@/hooks/use-auth";
import { performLogout } from "@/lib/auth/logout";
import { useFocusSubjectStore } from "@/stores/focus-subject.store";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  title: string;
  subtitle?: string;
}

/**
 * WorkspaceHeader — subject breadcrumb (left), go-to palette + officer (right).
 *
 * Deliberately quiet: no fabricated system-health claim, no decorative alert
 * dot, no clock. Freshness and provider health are reported by the surfaces
 * that actually measure them (Provider Health, panel state notices).
 */
export function TopBar({ title, subtitle }: TopBarProps) {
  const subject = useFocusSubjectStore((s) => s.subject);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 px-5",
        "border-b border-line-strong bg-surface",
      )}
    >
      <SidebarTrigger className="text-slate md:hidden" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="type-title truncate text-foreground">{title}</h1>
          {subject && (
            <span className="hidden min-w-0 items-baseline gap-2 truncate md:flex">
              <span className="text-slate">/</span>
              <span className="type-small truncate font-semibold text-foreground">
                {subject.title}
              </span>
            </span>
          )}
        </div>
        {subtitle && <div className="type-small truncate text-slate">{subtitle}</div>}
      </div>

      <div className="flex items-center gap-2">
        <NigeriaTime />
        <GoToHint />
        <CopilotButton />
        <NotificationBell />
        <ThemeToggle />
        <OfficerBadge />
      </div>

    </header>
  );
}

function NigeriaTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const formatted = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      }).format(now),
    [now],
  );

  return (
    <div className="hidden items-center gap-2 rounded-md border border-line bg-surface-2/70 px-2.5 py-1.5 md:flex">
      <CalendarClock className="h-3.5 w-3.5 text-slate" />
      <div className="leading-none">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate">Nigeria time</div>
        <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-foreground">
          {formatted} WAT
        </div>
      </div>
      <ConfidenceChip tier="observed" size={9} />
    </div>
  );
}

/** Copilot entry point — opens the existing Copilot surface, adds no logic. */
function CopilotButton() {
  const openCopilot = useCopilotStore((s) => s.openCopilot);
  return (
    <button
      type="button"
      onClick={() => openCopilot()}
      className="hidden items-center gap-1.5 rounded-md border border-line bg-surface-2/70 px-2.5 py-1.5 text-slate hover:border-[color:var(--ocean)]/50 hover:text-foreground motion-fast md:flex"
    >
      <Sparkles className="h-3.5 w-3.5 text-[color:var(--ocean)]" />
      <span className="type-small font-semibold">Copilot</span>
    </button>
  );
}

/** Unread alert count, read from the existing notification store. */
function NotificationBell() {
  const unread = useNotificationStore((s) => s.unreadCount);
  return (
    <Link
      to="/alerts"
      aria-label={unread > 0 ? `Alerts — ${unread} unread` : "Alerts"}
      className="relative flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface-2/70 text-slate hover:border-[color:var(--ocean)]/50 hover:text-foreground motion-fast"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-[color:var(--status-critical)] px-1 text-[10px] font-bold leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}


function GoToHint() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("seaphore:open-goto-palette"))}
      className="hidden items-center gap-2 rounded-md border border-line bg-surface-2/70 px-2.5 py-1.5 text-slate hover:border-[color:var(--ocean)]/50 hover:text-foreground motion-fast md:flex"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="type-small">Go to…</span>
      <kbd className="type-mono rounded border border-line bg-surface px-1 text-[10px] text-slate">
        ⌘J
      </kbd>
    </button>
  );
}

function OfficerBadge() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  if (loading) return null;
  if (!session) {
    return (
      <Button asChild size="sm" variant="default">
        <Link to="/auth" search={{} as { redirect: string }}>
          <LogIn className="mr-1.5 h-3.5 w-3.5" />
          Sign in
        </Link>
      </Button>
    );
  }
  const email = session.user.email ?? "Officer";
  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1.5 rounded-md border border-line bg-surface-2/70 px-2.5 py-1.5 xl:flex">
        <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--ocean)]" />
        <span className="type-small font-semibold text-foreground">NIMASA Watch</span>
      </div>
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-foreground"
        title={email}
      >
        <User2 className="h-4 w-4" />
      </div>
      <div className="hidden max-w-[160px] text-right leading-tight lg:block">
        <div className="type-small truncate font-semibold text-foreground">
          {email.split("@")[0]}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate">Officer</div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void performLogout({ queryClient, router })}
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
