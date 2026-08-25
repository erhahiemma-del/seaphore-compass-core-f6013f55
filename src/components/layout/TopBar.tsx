import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, Search, User2 } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
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
        <GoToHint />
        <ThemeToggle />
        <OfficerBadge />
      </div>
    </header>
  );
}

/** Discoverability affordance for the go-to palette (⌘J / Ctrl+J). */
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
