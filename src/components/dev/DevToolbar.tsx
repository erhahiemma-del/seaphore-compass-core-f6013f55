/**
 * DevToolbar — Development-only floating utility.
 *
 * Visible ONLY when `import.meta.env.DEV` is true, so it is stripped
 * entirely from production bundles. Provides:
 *   • Toggle Development Preview Mode (bypass auth)
 *   • Switch mock role (Analyst / Officer / Director / Admin / Agency)
 *   • Jump to any route
 *   • Seed / Reset demo data (client-side flags — surfaces demo modes)
 *
 * This is a UX/dev convenience only. RLS + server-side
 * `requireSupabaseAuth` remain authoritative in production.
 */
import { useMemo, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Navigation,
  Database,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_GROUPS } from "@/lib/nav";
import { DEV_MODE_AVAILABLE, DEV_ROLES } from "@/lib/dev/dev-mode";
import { ROLE_DASHBOARDS } from "@/lib/dev/role-dashboards";
import { useDevModeStore } from "@/stores/dev-mode.store";
import type { OfficerRole } from "@/stores/auth.store";

const EXTRA_ROUTES: { title: string; url: string }[] = [
  { title: "Auth / Login", url: "/auth" },
  { title: "Copilot Workspace", url: "/copilot" },
  { title: "Observability", url: "/observability" },
  { title: "Investigate — Open Queue", url: "/investigate/open" },
  { title: "Decide — Queue", url: "/decide/queue" },
  { title: "Share — Queue", url: "/share/queue" },
];

export function DevToolbar() {
  if (!DEV_MODE_AVAILABLE) return null;
  return <DevToolbarInner />;
}

function DevToolbarInner() {
  const { bypassAuth, mockRole, setBypassAuth, setMockRole } = useDevModeStore();
  const [open, setOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const routes = useMemo(() => {
    const flat = NAV_GROUPS.flatMap((g) =>
      g.items.map((i) => ({ title: `${g.label} · ${i.title}`, url: i.url })),
    );
    return [...flat, ...EXTRA_ROUTES];
  }, []);

  function handleToggleBypass() {
    const next = !bypassAuth;
    setBypassAuth(next);
    queryClient.clear();
    router.invalidate();
    toast.success(
      next
        ? "Dev Preview Mode ON — auth bypassed (mock officer)"
        : "Dev Preview Mode OFF — normal auth restored",
    );
  }

  function handleRole(role: OfficerRole) {
    setMockRole(role);
    if (!bypassAuth) setBypassAuth(true);
    setRoleOpen(false);
    queryClient.invalidateQueries();
    const dash = (ROLE_DASHBOARDS as Record<string, { url: string } | undefined>)[role];
    if (dash) navigate({ to: dash.url });
    toast.success(`Mock role → ${role}`);
  }

  function handleSeed() {
    try {
      localStorage.setItem("seaphore.dev.demo-seed", String(Date.now()));
    } catch {
      /* ignore */
    }
    queryClient.invalidateQueries();
    toast.success("Demo data seed flag set — reloading views");
  }

  function handleReset() {
    try {
      const keep = new Set(["seaphore.dev-mode.v1"]);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("seaphore.") && !keep.has(k)) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
    queryClient.clear();
    router.invalidate();
    toast.success("Demo data reset — caches cleared");
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] print:hidden">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur ${
            bypassAuth
              ? "border-amber-500/60 bg-amber-500/15 text-amber-100"
              : "border-border bg-background/90 text-muted-foreground"
          }`}
          aria-label="Open developer toolbar"
        >
          <Wrench className="h-3.5 w-3.5" aria-hidden />
          Dev
          {bypassAuth ? (
            <span className="ml-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              Bypass
            </span>
          ) : null}
        </button>
      ) : (
        <div className="w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <Wrench className="h-3.5 w-3.5" aria-hidden />
              Dev Toolbar
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close developer toolbar"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div className="space-y-2 p-3 text-sm">
            <Button
              type="button"
              onClick={handleToggleBypass}
              variant={bypassAuth ? "default" : "outline"}
              className="w-full justify-start"
            >
              {bypassAuth ? (
                <ShieldOff className="mr-2 h-4 w-4" aria-hidden />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
              )}
              {bypassAuth ? "Turn Login OFF (active)" : "Turn Login OFF"}
            </Button>

            <Popover open={roleOpen} onOpenChange={setRoleOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start" disabled={!bypassAuth}>
                  <UserCog className="mr-2 h-4 w-4" aria-hidden />
                  Role: <span className="ml-1 font-semibold">{mockRole}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                {DEV_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRole(r)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      r === mockRole ? "bg-accent/60 font-semibold" : ""
                    }`}
                  >
                    <span className="capitalize">{r.replace("_", " ")}</span>
                    {r === mockRole ? <span className="text-xs">✓</span> : null}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <Navigation className="mr-2 h-4 w-4" aria-hidden />
                  Jump to Screen
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <Command>
                  <CommandInput placeholder="Search routes…" />
                  <CommandList>
                    <CommandEmpty>No routes found.</CommandEmpty>
                    <CommandGroup>
                      {routes.map((r) => (
                        <CommandItem
                          key={r.url}
                          value={`${r.title} ${r.url}`}
                          onSelect={() => {
                            setJumpOpen(false);
                            setOpen(false);
                            navigate({ to: r.url });
                          }}
                        >
                          <span className="truncate">{r.title}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{r.url}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleSeed}>
                <Database className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Seed
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Reset
              </Button>
            </div>

            <p className="pt-1 text-[10px] leading-snug text-muted-foreground">
              Development build only. Stripped from production. RLS remains authoritative.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
