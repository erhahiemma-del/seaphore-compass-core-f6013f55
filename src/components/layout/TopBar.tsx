import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogIn, LogOut, User2 } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { performLogout } from "@/lib/auth/logout";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  title: string;
  subtitle?: string;
}

/**
 * TopBar — page title/subtitle (left), status dot + clock + alerts bell + officer (right).
 * Search lives exclusively in the Mission Intelligence Command Bar on Mission Control.
 */
export function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 px-4",
        "border-b border-line bg-surface/95 backdrop-blur",
      )}
    >
      <SidebarTrigger className="text-slate md:hidden" />
      <div className="min-w-0 flex-1">
        <div className="type-h1 text-foreground truncate">{title}</div>
        {subtitle && <div className="type-small text-slate truncate">{subtitle}</div>}
      </div>

      <div className="flex items-center gap-3">
        <StatusIndicator />
        <Clock />
        <ThemeToggle />
        <button
          type="button"
          aria-label="Alerts"
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-slate hover:bg-surface-2 motion-fast"
        >
          <Bell className="h-4 w-4" />
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "#C0392B" }}
          />
        </button>
        <OfficerBadge />
      </div>
    </header>
  );
}

function StatusIndicator() {
  return (
    <div className="hidden items-center gap-1.5 md:flex">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#1E6B3A" }} />
      <span className="type-small text-slate">All systems operational</span>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 30);
    return () => window.clearInterval(id);
  }, []);
  const label = now.toUTCString().slice(17, 22);
  return (
    <div className="hidden type-mono text-slate lg:block" aria-label="UTC time">
      {label} UTC
    </div>
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
        <Link to="/auth">
          <LogIn className="mr-1.5 h-3.5 w-3.5" />
          Sign in
        </Link>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-foreground">
        <User2 className="h-4 w-4" />
      </div>
      <div className="hidden text-right leading-tight sm:block">
        <div className="type-small font-semibold text-foreground">{session.user.email}</div>
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
