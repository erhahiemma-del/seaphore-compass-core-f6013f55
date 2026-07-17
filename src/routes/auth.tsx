import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Anchor, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in · Seaphore" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    // Already signed in — return to mission control
    navigate({ to: "/", replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) setError(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      navigate({ to: "/", replace: true });
    } catch {
      setError("Google sign-in is not configured yet.");
    }
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-ocean-deep p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Anchor className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-wide">SEAPHORE</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
              Maritime Intelligence OS
            </div>
          </div>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Detect. Investigate. Decide. Share. Learn.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/75">
            Seaphore is the maritime intelligence operating system for officers
            of the domain. Every number wears a confidence chip. Every
            recommendation comes from the system; every decision comes from the
            officer.
          </p>
        </div>

        <div className="text-[11px] tracking-wide text-sidebar-foreground/60">
          Evidence first. Explainable always. Officer decides.
        </div>
      </div>

      {/* Sign-in form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md border-border p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground">
              {mode === "signin" ? "Sign in to Seaphore" : "Request access"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Officer authentication required to enter the intelligence workspace."
                : "Provision your officer account. All access is auditable."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Official email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@agency.gov"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
          >
            Continue with Google
          </Button>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  className="font-medium text-brand hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Request access
                </button>
              </>
            ) : (
              <>
                Already provisioned?{" "}
                <button
                  type="button"
                  className="font-medium text-brand hover:underline"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="mt-8 border-t border-border pt-4 text-center text-[10px] tracking-wide text-muted-foreground">
            <Link to="/" className="hover:underline">
              Evidence first. Explainable always. Officer decides.
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
