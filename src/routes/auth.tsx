import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Anchor,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Shield,
  ShieldCheck,
  User,
  UserCog,
  Building2,
  KeyRound,
  Radar,
  AlertTriangle,
  Briefcase,
  BarChart3,
  CloudDrizzle,
  ScrollText,
  Fingerprint,
  Ship,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import heroImage from "@/assets/auth-hero.jpg";
import { cn } from "@/lib/utils";
import { getPendingMfaFactor } from "@/lib/auth/mfa";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { DEV_MODE_AVAILABLE } from "@/lib/dev/dev-mode";
import { useDevModeStore } from "@/stores/dev-mode.store";
import type { OfficerRole } from "@/stores/auth.store";

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
      { title: "Secure Access · Seaphore Maritime Intelligence OS" },
      {
        name: "description",
        content:
          "Authorized NIMASA personnel access to Seaphore — Nigeria's Maritime Intelligence Operating System.",
      },
    ],
  }),
  component: AuthPage,
});

const ROLE_TABS = [
  { key: "admin", label: "Administrator", icon: Shield },
  { key: "officer", label: "Officer", icon: User },
  { key: "analyst", label: "Analyst", icon: UserCog },
  { key: "director", label: "Director", icon: Briefcase },
] as const;

type RoleKey = (typeof ROLE_TABS)[number]["key"];

const KPI_CARDS = [
  { icon: Ship, value: "482", label: "LIVE VESSELS", sub: "Tracked", tone: "teal" },
  { icon: AlertTriangle, value: "12", label: "HIGH RISK", sub: "Vessels", tone: "red" },
  { icon: Briefcase, value: "6", label: "ACTIVE", sub: "Investigations", tone: "teal" },
  { icon: BarChart3, value: "71%", label: "PORT CONGESTION", sub: "Lagos Port", tone: "teal" },
  { icon: ShieldCheck, value: "96%", label: "NATIONAL", sub: "COMPLIANCE", tone: "teal" },
  { icon: KeyRound, value: "₦2.4B", label: "REVENUE", sub: "AT RISK", tone: "teal" },
] as const;

const TRUST_BAR = [
  { icon: Lock, label: "ENCRYPTED", sub: "End-to-end" },
  { icon: Building2, label: "GOVERNMENT NETWORK", sub: "Secure & Isolated" },
  { icon: User, label: "ROLE BASED ACCESS", sub: "Strict Permissions" },
  { icon: ScrollText, label: "AUDIT ENABLED", sub: "Every Action Tracked" },
  { icon: Fingerprint, label: "SESSION PROTECTED", sub: "Auto Timeout" },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<RoleKey>("admin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devLoading, setDevLoading] = useState<RoleKey | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string; factorName: string } | null>(null);

  const isDev = DEV_MODE_AVAILABLE;

  useEffect(() => {
    if (session && !mfa) navigate({ to: redirect, replace: true });
  }, [session, mfa, navigate, redirect]);

  async function goToDestination() {
    navigate({ to: redirect, replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const pending = await getPendingMfaFactor();
      if (pending) {
        setMfa({ factorId: pending.id, factorName: pending.friendlyName });
        return;
      }
      await goToDestination();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleQuickAccess(roleKey: RoleKey) {
    setDevLoading(roleKey);
    const store = useDevModeStore.getState();
    store.setMockRole(roleKey as OfficerRole);
    store.setBypassAuth(true);
    try {
      localStorage.setItem("seaphore.dev.demo-seed", String(Date.now()));
    } catch {
      /* ignore */
    }
    navigate({ to: redirect, replace: true });
  }

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-[#050B18] text-white">
      {/* ============== BACKGROUND HERO ============== */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt=""
          aria-hidden
          className="h-full w-full object-cover object-center opacity-90"
        />
        {/* Depth gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#040912]/95 via-[#050B18]/60 to-[#040912]/95" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#040912]/70 via-transparent to-[#040912]/90" />

        {/* Intelligence overlays (SVG) */}
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.35] mix-blend-screen"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 1600 1000"
        >
          <defs>
            <radialGradient id="radar" cx="50%" cy="60%" r="40%">
              <stop offset="0%" stopColor="#10E5C4" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#10E5C4" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#10E5C4" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* radar rings */}
          <g stroke="#10E5C4" strokeWidth="0.6" fill="none" opacity="0.55">
            <circle cx="800" cy="620" r="120" />
            <circle cx="800" cy="620" r="220" />
            <circle cx="800" cy="620" r="340" />
            <circle cx="800" cy="620" r="460" />
          </g>
          <circle cx="800" cy="620" r="460" fill="url(#radar)" />
          {/* AIS tracks */}
          <g
            stroke="#10E5C4"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4 6"
            opacity="0.7"
          >
            <path d="M120,780 Q420,700 800,620" />
            <path d="M1500,760 Q1200,700 900,640" />
            <path d="M300,900 Q560,820 780,660" />
            <path d="M80,560 Q380,540 640,600" />
          </g>
          {/* geofence */}
          <path
            d="M540,540 L1060,520 L1160,780 L520,820 Z"
            stroke="#10E5C4"
            strokeWidth="1"
            strokeDasharray="2 4"
            fill="#10E5C4"
            fillOpacity="0.04"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* ============== LEFT PANEL (hero content) ============== */}
      <div className="relative z-10 hidden w-[58%] flex-col justify-between px-12 py-10 lg:flex xl:px-16">
        {/* Brand row */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0F5F5A]/90 shadow-lg ring-1 ring-[#10E5C4]/40">
              <Anchor className="h-5 w-5 text-white" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <div className="text-[22px] font-bold tracking-[0.14em] text-white">SEAPHORE</div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#10E5C4]">
                Maritime Intelligence OS
              </div>
            </div>
          </div>

          <div className="h-10 w-px bg-white/10" />

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#10E5C4]/40 bg-white/5 text-[#10E5C4]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-bold tracking-wide text-white">NIMASA</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/60">
                Nigeria Maritime Administration
                <br />
                and Safety Agency
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="max-w-[640px]">
          <h1 className="text-[46px] font-semibold leading-[1.05] tracking-tight text-white xl:text-[54px]">
            Nigeria's Maritime
            <br />
            Intelligence{" "}
            <span className="text-[#10E5C4]">Operating System</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            Real-time maritime domain awareness.
            <br />
            Actionable intelligence.
            <span className="ml-2 text-white/90">Secure decisions.</span>
          </p>

          {/* KPI cards */}
          <div className="mt-8 grid grid-cols-3 gap-3 xl:grid-cols-6 xl:gap-3">
            {KPI_CARDS.map((k) => {
              const Icon = k.icon;
              const valueColor = k.tone === "red" ? "text-[#FF6B6B]" : "text-white";
              return (
                <div
                  key={k.label}
                  className="rounded-xl border border-white/10 bg-[#0A1424]/70 p-3 backdrop-blur-md"
                >
                  <Icon
                    className={cn(
                      "mb-2 h-4 w-4",
                      k.tone === "red" ? "text-[#FF6B6B]" : "text-[#10E5C4]",
                    )}
                  />
                  <div className={cn("text-[20px] font-bold leading-none", valueColor)}>
                    {k.value}
                  </div>
                  <div
                    className={cn(
                      "mt-1.5 text-[9px] font-bold uppercase tracking-[0.1em]",
                      k.tone === "red" ? "text-[#FF6B6B]" : "text-[#10E5C4]",
                    )}
                  >
                    {k.label}
                  </div>
                  <div className="text-[9px] uppercase tracking-wide text-white/60">{k.sub}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trust indicators */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {TRUST_BAR.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.label}
                className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#0A1424]/60 px-3 py-2.5 backdrop-blur-md"
              >
                <Icon className="h-4 w-4 text-[#10E5C4]" />
                <div className="leading-tight">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                    {t.label}
                  </div>
                  <div className="text-[9px] text-white/60">{t.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating overlays: vessel label + weather (decorative) */}
      <div className="pointer-events-none absolute bottom-[24%] left-[38%] z-[5] hidden xl:block">
        <div className="rounded-md border border-[#10E5C4]/40 bg-[#0A1424]/80 px-3 py-2 text-[10px] leading-tight text-white backdrop-blur-md">
          <div className="font-bold tracking-wide text-[#10E5C4]">MV MAERSK LAGOS</div>
          <div className="text-white/70">IMO 9723451</div>
          <div className="text-white/70">DEST: TIN CAN ISLAND PORT</div>
        </div>
      </div>
      <div className="pointer-events-none absolute right-[42%] top-[42%] z-[5] hidden xl:block">
        <div className="flex items-start gap-2 rounded-md border border-[#FFB020]/40 bg-[#0A1424]/80 px-3 py-2 text-[10px] leading-tight text-white backdrop-blur-md">
          <CloudDrizzle className="mt-0.5 h-3.5 w-3.5 text-[#FFB020]" />
          <div>
            <div className="font-bold text-[#FFB020]">WEATHER ALERT</div>
            <div className="text-white/70">Moderate wind, 3.2 m waves</div>
          </div>
        </div>
      </div>

      {/* ============== RIGHT PANEL (auth card) ============== */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10 lg:px-10">
        <div className="w-full max-w-[440px]">
          <div className="rounded-2xl border border-white/10 bg-[#0A1424]/80 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-[#10E5C4]/40 bg-[#10E5C4]/10 text-[#10E5C4]">
                <Lock className="h-5 w-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#10E5C4]">
                Secure Access
              </div>
              <h2 className="mt-2 text-[24px] font-semibold text-white">Maritime Intelligence OS</h2>
              <p className="mt-1 text-[12.5px] text-white/60">Authorized NIMASA Personnel Only</p>
            </div>

            {mfa ? (
              <MfaChallenge
                factorId={mfa.factorId}
                factorName={mfa.factorName}
                onVerified={() => {
                  setMfa(null);
                  void goToDestination();
                }}
                onCancel={() => {
                  setMfa(null);
                  void supabase.auth.signOut();
                }}
              />
            ) : (
              <>
                {/* Role selector */}
                <div className="mb-5 grid grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-black/20 p-1.5">
                  {ROLE_TABS.map((r) => {
                    const Icon = r.icon;
                    const active = role === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setRole(r.key)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-[10.5px] font-semibold transition-all",
                          active
                            ? "border border-[#10E5C4]/50 bg-[#10E5C4]/10 text-[#10E5C4] shadow-[0_0_20px_-8px_rgba(16,229,196,0.6)]"
                            : "text-white/60 hover:bg-white/5 hover:text-white/90",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {r.label}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email */}
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email or username"
                      className="h-11 rounded-lg border-white/10 bg-black/30 pl-10 text-[13.5px] text-white placeholder:text-white/40 focus-visible:border-[#10E5C4] focus-visible:ring-[#10E5C4]/20"
                    />
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="h-11 rounded-lg border-white/10 bg-black/30 pl-10 pr-10 text-[13.5px] text-white placeholder:text-white/40 focus-visible:border-[#10E5C4] focus-visible:ring-[#10E5C4]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[12px]">
                    <label className="flex cursor-pointer items-center gap-2 text-white/70">
                      <Checkbox
                        checked={remember}
                        onCheckedChange={(v) => setRemember(v === true)}
                        className="border-white/30 data-[state=checked]:border-[#10E5C4] data-[state=checked]:bg-[#10E5C4] data-[state=checked]:text-[#04121A]"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      className="font-semibold text-[#10E5C4] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="group h-11 w-full rounded-lg bg-gradient-to-r from-[#10E5C4] to-[#12B39A] text-[13.5px] font-semibold text-[#04121A] shadow-[0_10px_30px_-8px_rgba(16,229,196,0.55)] hover:brightness-105"
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Access Command Center
                    <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>

                  <div className="relative py-1 text-center">
                    <div className="absolute inset-0 top-1/2 h-px bg-white/10" />
                    <span className="relative bg-[#0A1424] px-3 text-[11px] uppercase tracking-widest text-white/40">
                      OR
                    </span>
                  </div>

                  <button
                    type="button"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] text-[13px] font-semibold text-white hover:bg-white/[0.06]"
                  >
                    <ShieldCheck className="h-4 w-4 text-[#10E5C4]" />
                    Sign in with NIMASA SSO
                  </button>

                  <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[10.5px] leading-relaxed text-white/50">
                    <Lock className="h-3 w-3" />
                    All access is monitored and encrypted in accordance with NIMASA security
                    policies.
                  </p>
                </form>
              </>
            )}
          </div>

          {/* Dev quick access */}
          {isDev && !mfa && (
            <div className="mt-4 rounded-xl border border-dashed border-[#10E5C4]/30 bg-[#0A1424]/70 p-4 backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#10E5C4]">
                  <Radar className="h-3.5 w-3.5" />
                  Development · Quick Access
                </div>
                <span className="rounded-full bg-[#10E5C4]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#10E5C4]">
                  Preview
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_TABS.map((r) => {
                  const Icon = r.icon;
                  const loading = devLoading === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      disabled={loading}
                      onClick={() => handleQuickAccess(r.key)}
                      className="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-left transition hover:border-[#10E5C4]/50 hover:bg-[#10E5C4]/10 disabled:opacity-60"
                    >
                      <Icon className="h-4 w-4 text-[#10E5C4]" />
                      <span className="flex-1 text-[12px] font-semibold text-white">
                        {r.label === "Officer" ? "Intelligence Officer" : r.label}
                      </span>
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#10E5C4]" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[#10E5C4]" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] leading-snug text-white/50">
                Preview only. Bypass is disabled in production builds; real authentication is
                enforced there.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-6 py-3 text-[10.5px] uppercase tracking-widest text-white/50 lg:px-12">
        <span>© 2026 NIMASA. All rights reserved.</span>
        <span className="hidden items-center gap-2 md:flex">
          <Anchor className="h-3 w-3 text-[#10E5C4]" />
          Powered by Seaphore Maritime Intelligence OS
        </span>
        <span className="hidden items-center gap-2 md:flex">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-gradient-to-b from-[#008751] via-white to-[#008751]" />
          Securing Nigeria's Maritime Domain
        </span>
      </div>
    </div>
  );
}
