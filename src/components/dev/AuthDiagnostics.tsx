/**
 * Authentication Diagnostics — dev-only inspector.
 *
 * Every entry answers "why is auth in the state it's in right now?"
 * and, on failure, "what should I try next?".
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-permissions";
import { DEV_AUTH_ENABLED } from "@/lib/dev/env";

type Status = "ok" | "warn" | "fail" | "pending";
interface Row {
  label: string;
  status: Status;
  detail: string;
  fix?: string;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function AuthDiagnostics({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { session, loading } = useAuth();
  const { role, roles } = useRoles();
  const [reachable, setReachable] = useState<Status>("pending");
  const [reachDetail, setReachDetail] = useState("Checking…");

  useEffect(() => {
    if (!open) return;
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) {
      setReachable("fail");
      setReachDetail("VITE_SUPABASE_URL is not set");
      return;
    }
    fetch(`${url}/auth/v1/health`, { method: "GET" })
      .then((r) => {
        setReachable(r.ok ? "ok" : "warn");
        setReachDetail(`${r.status} ${r.statusText}`);
      })
      .catch((e) => {
        setReachable("fail");
        setReachDetail(e instanceof Error ? e.message : "network error");
      });
  }, [open]);

  const rows: Row[] = useMemo(() => {
    const jwt = session?.access_token ? decodeJwt(session.access_token) : null;
    const expiresIn = session?.expires_at
      ? session.expires_at - Math.floor(Date.now() / 1000)
      : null;

    return [
      {
        label: "Environment",
        status: "ok",
        detail: `MODE=${import.meta.env.MODE} · DEV_AUTH_ENABLED=${DEV_AUTH_ENABLED}`,
      },
      {
        label: "Auth Provider",
        status: "ok",
        detail: "Supabase (Lovable Cloud)",
      },
      {
        label: "Supabase URL",
        status: reachable,
        detail: reachDetail,
        fix:
          reachable === "fail"
            ? "Verify VITE_SUPABASE_URL and that Lovable Cloud is provisioned."
            : undefined,
      },
      {
        label: "Session Loading",
        status: loading ? "pending" : "ok",
        detail: loading ? "in progress" : "settled",
      },
      {
        label: "Current Session",
        status: session ? "ok" : "warn",
        detail: session
          ? `${session.user.email ?? session.user.id}`
          : "no session (visitor is signed out)",
        fix: session ? undefined : "Click a Quick Login card or sign in with credentials.",
      },
      {
        label: "JWT",
        status: jwt ? "ok" : session ? "fail" : "warn",
        detail: jwt
          ? `sub=${String(jwt.sub).slice(0, 8)}… · role=${String(jwt.role ?? "-")}${
              expiresIn !== null ? ` · exp in ${expiresIn}s` : ""
            }`
          : "no bearer token",
        fix:
          !jwt && session
            ? "Session lacks a JWT — sign out and back in; server fns will 401."
            : undefined,
      },
      {
        label: "Role Resolution",
        status: role ? "ok" : session ? "warn" : "pending",
        detail: role
          ? `${role}${roles.length > 1 ? ` (+${roles.length - 1} more)` : ""}`
          : session
            ? "no role row for this user"
            : "waiting on session",
        fix:
          !role && session
            ? "Insert a row in public.user_roles for this user_id, or re-run the dev seed migration."
            : undefined,
      },
    ];
  }, [session, loading, role, roles, reachable, reachDetail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Authentication Diagnostics</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-start gap-3 rounded-md border border-border bg-card/50 p-3"
            >
              <StatusIcon status={r.status} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{r.detail}</div>
                {r.fix && (
                  <div className="mt-1 text-xs text-amber-500">
                    <span className="font-semibold">Fix:</span> {r.fix}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />;
  if (status === "fail") return <XCircle className="mt-0.5 h-4 w-4 text-red-500" />;
  if (status === "warn") return <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />;
  return <AlertCircle className="mt-0.5 h-4 w-4 animate-pulse text-muted-foreground" />;
}
