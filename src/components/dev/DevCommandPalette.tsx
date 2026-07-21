/**
 * Dev Command Palette — Ctrl+Shift+D.
 *
 * Guarded by `DEV_AUTH_ENABLED`; the parent gate in `__root.tsx`
 * ensures Rollup tree-shakes this module out of production bundles.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Activity, LogIn, RotateCcw, Trash2, Bug, KeyRound, Shield, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { performLogout } from "@/lib/auth/logout";
import { quickLoginAs } from "@/lib/dev/quick-login";
import { DEV_ROLES } from "@/lib/dev/env";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-permissions";
import { AuthDiagnostics } from "./AuthDiagnostics";

export function DevCommandPalette() {
  const [open, setOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuth();
  const { role, roles } = useRoles();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sessionSummary = useMemo(() => {
    if (!session) return "no session";
    return `${session.user.email ?? session.user.id} · exp ${
      session.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : "?"
    }`;
  }, [session]);

  async function run(fn: () => Promise<void> | void) {
    setOpen(false);
    await fn();
  }

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter>
          <CommandInput placeholder="Dev command… (Ctrl+Shift+D)" />
          <CommandList>
            <CommandEmpty>No commands.</CommandEmpty>
            <CommandGroup heading="Quick Login">
              {DEV_ROLES.map((r) => (
                <CommandItem
                  key={r.key}
                  onSelect={() =>
                    run(async () => {
                      const res = await quickLoginAs(r.key);
                      if (res.ok) navigate({ to: res.landingPath, replace: true });
                      else console.error("[quickLoginAs]", res);
                    })
                  }
                >
                  <LogIn className="mr-2 h-4 w-4" /> Login as {r.label}
                  <span className="ml-auto text-xs text-muted-foreground">{r.landingPath}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Session">
              <CommandItem
                onSelect={() =>
                  run(async () => {
                    await performLogout({ queryClient: qc, router });
                  })
                }
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Reset Session (logout)
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  run(() => {
                    qc.clear();
                    try {
                      Object.keys(localStorage)
                        .filter((k) => k.startsWith("seaphore."))
                        .forEach((k) => localStorage.removeItem(k));
                    } catch {
                      /* ignore */
                    }
                  })
                }
              >
                <Trash2 className="mr-2 h-4 w-4" /> Clear Cache (query + local storage)
              </CommandItem>
              <CommandItem onSelect={() => run(() => setDiagOpen(true))}>
                <Bug className="mr-2 h-4 w-4" /> Open Authentication Diagnostics
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Inspect">
              <CommandItem>
                <User className="mr-2 h-4 w-4" /> Session
                <span className="ml-auto max-w-[300px] truncate text-xs text-muted-foreground">
                  {sessionSummary}
                </span>
              </CommandItem>
              <CommandItem>
                <Shield className="mr-2 h-4 w-4" /> Role
                <span className="ml-auto text-xs text-muted-foreground">
                  {role ?? "—"} {roles.length > 1 ? `(+${roles.length - 1})` : ""}
                </span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  run(async () => {
                    const { data } = await supabase.auth.getSession();
                    console.info("[Seaphore] session:", data.session);
                  })
                }
              >
                <KeyRound className="mr-2 h-4 w-4" /> Log current session to console
              </CommandItem>
              <CommandItem>
                <Activity className="mr-2 h-4 w-4" /> Env
                <span className="ml-auto text-xs text-muted-foreground">
                  DEV_AUTH_ENABLED · MODE={import.meta.env.MODE}
                </span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <AuthDiagnostics open={diagOpen} onOpenChange={setDiagOpen} />
    </>
  );
}
