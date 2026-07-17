import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, User2 } from "lucide-react";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Global chrome for every operational screen.
 *
 * Footer principle (immutable):
 *   Evidence first. Explainable always. Officer decides.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 overflow-x-hidden">{children}</main>
          <AppFooter />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AppHeader() {
  const { session, loading } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
      <SidebarTrigger className="text-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-verified" />
        <span className="text-xs font-medium text-muted-foreground">
          All Systems Operational
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {loading ? null : session ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <User2 className="h-4 w-4" />
            </div>
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-foreground">
                {session.user.email}
              </div>
              <div className="text-[11px] text-muted-foreground">Officer</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        ) : (
          <Button asChild size="sm" variant="default">
            <Link to="/auth">
              <LogIn className="mr-1.5 h-3.5 w-3.5" />
              Sign in
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 px-6 py-3">
      <div className="flex flex-col items-start justify-between gap-1 text-[11px] text-muted-foreground sm:flex-row sm:items-center">
        <span className="font-medium tracking-wide text-foreground/80">
          Evidence first. Explainable always. Officer decides.
        </span>
        <span className="tracking-wide">
          SEAPHORE · Maritime Intelligence OS · v0.1 Foundation
        </span>
      </div>
    </footer>
  );
}
