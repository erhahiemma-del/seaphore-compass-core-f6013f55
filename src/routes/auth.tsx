import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Anchor,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  FileCheck2,
  Fingerprint,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import heroImage from "@/assets/auth-hero.jpg";
import { cn } from "@/lib/utils";
import { getPendingMfaFactor } from "@/lib/auth/mfa";
import { MfaChallenge } from "@/components/auth/MfaChallenge";

/**
 * Only accept same-origin absolute paths as the post-login redirect
 * target. Rejects protocol-relative (`//evil`), external URLs
 * (`https://evil`), and non-path values. Prevents open-redirect abuse.
 */
function sanitizeRedirect(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.startsWith("/\\")) return "/";
  return raw;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Seaphore" },
      {
        name: "description",
        content:
          "Secure officer access to Seaphore — the Maritime Intelligence Operating System for NIMASA.",
      },
    ],
  }),
  component: AuthPage,
});

const DEMO_ROLES = [
  {
    key: "admin",
    label: "Administrator",
    caption: "Full platform & RBAC control",
    email: "admin@seaphore.dev",
  },
  {
    key: "director",
    label: "Director",
    caption: "Approves briefs & decisions",
    email: "director@seaphore.dev",
  },
  {
    key: "officer",
    label: "Intelligence Officer",
    caption: "Investigates & decides",
    email: "officer@seaphore.dev",
  },
  {
    key: "analyst",
    label: "Analyst",
    caption: "Read-only, triage feeds",
    email: "analyst@seaphore.dev",
  },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string; factorName: string } | null>(null);

  const isDev = import.meta.env.DEV;

  // Already authenticated and no MFA pending? Bounce to the intended URL.
  if (session && !mfa) {
    navigate({ to: redirect, replace: true });
  }

  async function goToDestination() {
    navigate({ to: redirect, replace: true });
  }

  async function signIn(emailValue: string, passwordValue: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
    });
    if (error) throw error;
    // Step-up if the account has TOTP enrolled but the session is still aal1.
    const pending = await getPendingMfaFactor();
    if (pending) {
      setMfa({ factorId: pending.id, factorName: pending.friendlyName });
      return;
    }
    await goToDestination();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin(roleKey: string) {
    setError(null);
    setDemoLoading(roleKey);
    try {
      const res = await fetch("/api/public/dev/seed-role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: roleKey }),
      });
      if (!res.ok) throw new Error(`Seed failed (${res.status})`);
      const payload = (await res.json()) as { email: string; password: string };
      setEmail(payload.email);
      setPassword(payload.password);
      await signIn(payload.email, payload.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login unavailable");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-[#F4F6F8]">
      {/* Left — brand + hero */}
      <div className="relative hidden w-[52%] flex-col overflow-hidden bg-white p-10 lg:flex">
        {/* Brand row */}
        <div className="relative z-10 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0F5F5A] text-white shadow-sm">
              <Anchor className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <div className="text-[22px] font-bold tracking-[0.14em] text-[#0B2545]">SEAPHORE</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Maritime Intelligence OS
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0F5F5A]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#0F5F5A]/70 bg-white text-[#0F5F5A]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <span>NIMASA</span>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 mt-10 max-w-[520px]">
          <h1 className="text-[42px] font-semibold leading-[1.1] tracking-tight text-[#0B2545]">
            Intelligence that
            <br />
            protects our waters<span className="text-[#0F5F5A]">.</span>
          </h1>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-slate-600">
            Seaphore is the maritime intelligence operating system for NIMASA —{" "}
            <span className="font-semibold text-[#0F5F5A]">
              Detect. Investigate. Decide. Share. Learn.
            </span>
          </p>
        </div>

        {/* Hero image */}
        <div className="relative z-0 mt-8 flex-1 overflow-hidden rounded-2xl border border-slate-200 shadow-[0_20px_60px_-30px_rgba(11,37,69,0.4)]">
          <img
            src={heroImage}
            alt="Cargo vessels tracked by maritime intelligence"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B2545]/70 via-transparent to-transparent" />

          {/* Trusted badge */}
          <div className="absolute bottom-5 left-5 flex items-start gap-3 rounded-xl border border-white/10 bg-[#0B2545]/70 p-4 backdrop-blur-md">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0F5F5A] text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="text-white">
              <div className="text-sm font-semibold">Trusted by NIMASA</div>
              <div className="text-[11px] leading-snug text-white/70">
                Powering safer seas through
                <br />
                actionable intelligence.
              </div>
            </div>
          </div>
        </div>

        {/* Feature chips */}
        <div className="relative z-10 mt-6 grid grid-cols-4 gap-3">
          {[
            { icon: FileCheck2, label: "Evidence First" },
            { icon: Sparkles, label: "Explainable AI" },
            { icon: Lock, label: "Secure by Design" },
            { icon: ScrollText, label: "Audit Everything" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-medium text-slate-700"
            >
              <Icon className="h-4 w-4 text-[#0F5F5A]" strokeWidth={2.2} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 flex-col bg-[#F4F6F8]">
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-[460px] rounded-2xl bg-white p-10 shadow-[0_10px_40px_-20px_rgba(11,37,69,0.25)]">
            <div className="mb-8">
              <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0F5F5A]">
                Welcome back
              </div>
              <h2 className="mt-1 text-[28px] font-semibold leading-tight text-[#0B2545]">
                Sign in to Seaphore
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
                Secure access for authorized NIMASA officers to the maritime intelligence workspace.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-semibold text-[#0B2545]">
                  Official email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@nimasa.gov.ng"
                    className="h-11 rounded-lg border-slate-200 pl-9 text-[14px] placeholder:text-slate-400 focus-visible:border-[#0F5F5A] focus-visible:ring-[#0F5F5A]/20"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-semibold text-[#0B2545]">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-11 rounded-lg border-slate-200 pl-9 pr-10 text-[14px] placeholder:text-slate-400 focus-visible:border-[#0F5F5A] focus-visible:ring-[#0F5F5A]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                    className="border-slate-300 data-[state=checked]:border-[#0F5F5A] data-[state=checked]:bg-[#0F5F5A]"
                  />
                  Remember me
                </label>
                <button type="button" className="font-semibold text-[#0F5F5A] hover:underline">
                  Forgot password?
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="group h-12 w-full rounded-lg bg-[#0B2545] text-[14px] font-semibold text-white hover:bg-[#0B2545]/92"
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign in
                <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>

              <div className="relative py-1 text-center">
                <div className="absolute inset-0 top-1/2 h-px bg-slate-200" />
                <span className="relative bg-white px-3 text-[12px] text-slate-400">or</span>
              </div>

              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#0F5F5A]/40 bg-white text-[14px] font-semibold text-[#0F5F5A] hover:bg-[#0F5F5A]/5"
              >
                <Fingerprint className="h-4 w-4" />
                Sign in with NIMASA SSO
              </button>

              <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11.5px] leading-relaxed text-slate-500">
                <Lock className="h-3 w-3" />
                All access is monitored and encrypted in accordance with NIMASA security policies.
              </p>
            </form>

            {isDev && (
              <div className="mt-6 rounded-xl border border-dashed border-[#0F5F5A]/40 bg-[#0F5F5A]/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0F5F5A]">
                    Development · One-click role sign-in
                  </div>
                  <span className="rounded-full bg-[#0F5F5A]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0F5F5A]">
                    DEV ONLY
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ROLES.map((r) => {
                    const loading = demoLoading === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        disabled={loading || submitting}
                        onClick={() => handleDemoLogin(r.key)}
                        className={cn(
                          "group flex flex-col items-start gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-all hover:border-[#0F5F5A] hover:shadow-sm disabled:opacity-60",
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="text-[12.5px] font-semibold text-[#0B2545]">
                            {r.label}
                          </span>
                          {loading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0F5F5A]" />
                          ) : (
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F5F5A]" />
                          )}
                        </div>
                        <span className="text-[10.5px] leading-tight text-slate-500">
                          {r.caption}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10.5px] leading-snug text-slate-500">
                  Seeds a demo account with the selected RBAC role and signs in. Disabled in
                  production.
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between px-8 pb-6 pt-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#0F5F5A]" />
            <span>© {new Date().getFullYear()} NIMASA. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-[#0B2545]">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-[#0B2545]">
              Terms of Use
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
