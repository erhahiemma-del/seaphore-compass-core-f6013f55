import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getIntelligenceMetrics } from "@/lib/intelligence-metrics.functions";
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
  Radar,
  AlertTriangle,
  Briefcase,
  BarChart3,
  CloudDrizzle,
  ScrollText,
  Ship,
  Crown,
  Activity,
  Workflow,
  Sparkles,
  Network,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import heroImage from "@/assets/auth-hero.jpg";
import nimasaLogo from "@/assets/nimasa-logo.png.asset.json";
import { cn } from "@/lib/utils";
import { getPendingMfaFactor } from "@/lib/auth/mfa";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { DEV_MODE_AVAILABLE } from "@/lib/dev/dev-mode";
import { ROLE_DASHBOARDS } from "@/lib/dev/role-dashboards";
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
      { title: "Mission Access · Seaphore Maritime Intelligence OS" },
      {
        name: "description",
        content:
          "Authorized NIMASA personnel access to Seaphore — Nigeria's Maritime Intelligence Operating System.",
      },
    ],
  }),
  component: AuthPage,
});

type RoleKey = "admin" | "director" | "officer" | "analyst";

const MISSION_ROLES: {
  key: RoleKey;
  label: string;
  glyph: string;
  icon: typeof Shield;
  tagline: string;
  description: string;
  badge: string;
  dashboard: string;
}[] = [
  {
    key: "admin",
    label: "Administrator",
    glyph: "👑",
    icon: Crown,
    tagline: "Full System Control",
    description:
      "Configure the platform, manage users, review audit trails, and govern every intelligence surface.",
    badge: "All Permissions",
    dashboard: ROLE_DASHBOARDS.admin.label,
  },
  {
    key: "director",
    label: "Director",
    glyph: "🛡",
    icon: Shield,
    tagline: "Strategic Command",
    description:
      "Approve investigations, authorize enforcement, and steer national maritime posture from a single dashboard.",
    badge: "Approve · Escalate · Command",
    dashboard: ROLE_DASHBOARDS.director.label,
  },
  {
    key: "officer",
    label: "Intelligence Officer",
    glyph: "🚢",
    icon: Ship,
    tagline: "Operations Dashboard",
    description:
      "Run active cases, orchestrate the Copilot, dispatch workflows, and make signed officer decisions.",
    badge: "Investigate · Decide · Share",
    dashboard: ROLE_DASHBOARDS.officer.label,
  },
  {
    key: "analyst",
    label: "Analyst",
    glyph: "📊",
    icon: BarChart3,
    tagline: "Intelligence Dashboard",
    description:
      "Triage signals, correlate evidence, and prepare briefings for officer review across the domain.",
    badge: "Read · Analyze · Recommend",
    dashboard: ROLE_DASHBOARDS.analyst.label,
  },
];

const KPI_CARDS = [
  {
    icon: ScrollText,
    metricKey: "manifest" as const,
    fallback: "—",
    label: "MANIFEST INTELLIGENCE",
    sub: "Records Indexed",
    tone: "teal",
  },
  {
    icon: Ship,
    metricKey: "vessel" as const,
    fallback: "—",
    label: "VESSEL INTELLIGENCE",
    sub: "Profiles Maintained",
    tone: "teal",
  },
  {
    icon: Briefcase,
    metricKey: "container" as const,
    fallback: "—",
    label: "CONTAINER INTELLIGENCE",
    sub: "Movements Tracked",
    tone: "teal",
  },
  {
    icon: Anchor,
    metricKey: "revenue" as const,
    fallback: "—",
    label: "REVENUE INTELLIGENCE",
    sub: "Leakage Identified",
    tone: "teal",
  },
  {
    icon: ShieldCheck,
    metricKey: "risk" as const,
    fallback: "—",
    label: "RISK INTELLIGENCE",
    sub: "Detection Confidence",
    tone: "teal",
  },
  {
    icon: BarChart3,
    metricKey: "historical" as const,
    fallback: "—",
    label: "HISTORICAL INTELLIGENCE",
    sub: "Coverage",
    tone: "teal",
  },
];

// Live operational status — replaces the static security trust bar.
const OPS_STATUS = [
  { icon: Lock, label: "ENCRYPTION", state: "AES-256 · Active" },
  { icon: Building2, label: "GOVERNMENT NETWORK", state: "NIMASA · Secure" },
  { icon: ShieldCheck, label: "POLICY ENGINE", state: "Online" },
  { icon: Workflow, label: "WORKFLOW ENGINE", state: "Ready" },
  { icon: Sparkles, label: "COPILOT", state: "Standing By" },
  { icon: ScrollText, label: "AUDIT LOGGING", state: "Streaming" },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [prodRole, setProdRole] = useState<RoleKey>("admin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devLoading, setDevLoading] = useState<RoleKey | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string; factorName: string } | null>(null);
  const { data: intelligenceMetrics } = useQuery({
    queryKey: ["intelligence-metrics"],
    queryFn: () => getIntelligenceMetrics(),
    staleTime: 60_000,
  });

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

  function handleMissionAccess(roleKey: RoleKey) {
    setDevLoading(roleKey);
    const store = useDevModeStore.getState();
    store.setMockRole(roleKey as OfficerRole);
    store.setBypassAuth(true);
    try {
      localStorage.setItem("seaphore.dev.demo-seed", String(Date.now()));
    } catch {
      /* ignore */
    }
    const dash = ROLE_DASHBOARDS[roleKey].url;
    navigate({ to: dash, replace: true });
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
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10E5C4" stopOpacity="0" />
              <stop offset="70%" stopColor="#10E5C4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10E5C4" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <g stroke="#10E5C4" strokeWidth="0.6" fill="none" opacity="0.55">
            <circle cx="800" cy="620" r="120" />
            <circle cx="800" cy="620" r="220" />
            <circle cx="800" cy="620" r="340" />
            <circle cx="800" cy="620" r="460" />
          </g>
          <circle cx="800" cy="620" r="460" fill="url(#radar)" />

          {/* Radar sweep wedge (animated) */}
          <g transform="translate(800 620)">
            <path
              d="M0 0 L460 0 A460 460 0 0 1 397 230 Z"
              fill="url(#sweep)"
              opacity="0.55"
              style={{ transformOrigin: "0 0", animation: "seaphore-radar-sweep 6s linear infinite" }}
            />
          </g>

          {/* AIS tracks */}
          <g stroke="#10E5C4" strokeWidth="1" fill="none" strokeDasharray="4 6" opacity="0.7">
            <path
              d="M120,780 Q420,700 800,620"
              style={{ strokeDasharray: "6 10", animation: "seaphore-ais-flow 6s linear infinite" }}
            />
            <path
              d="M1500,760 Q1200,700 900,640"
              style={{ strokeDasharray: "6 10", animation: "seaphore-ais-flow 7s linear infinite" }}
            />
            <path
              d="M300,900 Q560,820 780,660"
              style={{ strokeDasharray: "6 10", animation: "seaphore-ais-flow 8s linear infinite" }}
            />
            <path
              d="M80,560 Q380,540 640,600"
              style={{ strokeDasharray: "6 10", animation: "seaphore-ais-flow 9s linear infinite" }}
            />
          </g>

          {/* Intelligence markers */}
          <g>
            {[
              { cx: 640, cy: 600 },
              { cx: 900, cy: 640 },
              { cx: 780, cy: 660 },
              { cx: 1060, cy: 520 },
              { cx: 520, cy: 820 },
            ].map((m, i) => (
              <g key={i}>
                <circle cx={m.cx} cy={m.cy} r="3" fill="#10E5C4" />
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r="3"
                  fill="none"
                  stroke="#10E5C4"
                  strokeWidth="1"
                  opacity="0.7"
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animation: `seaphore-ping 2.4s ease-out ${i * 0.35}s infinite`,
                  }}
                />
              </g>
            ))}
          </g>

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

        {/* Keyframes — scoped, kept in-file so the hero is self-contained */}
        <style>{`
          @keyframes seaphore-radar-sweep {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes seaphore-ais-flow {
            from { stroke-dashoffset: 0; }
            to { stroke-dashoffset: -160; }
          }
          @keyframes seaphore-ping {
            0% { transform: scale(1); opacity: 0.9; }
            80% { transform: scale(6); opacity: 0; }
            100% { transform: scale(6); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            [style*="seaphore-"] { animation: none !important; }
          }
        `}</style>
      </div>

      {/* ============== LEFT PANEL ============== */}
      <div className="relative z-10 hidden w-[54%] flex-col justify-between px-12 py-10 lg:flex xl:px-16">
        <div className="flex items-center gap-5 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#0F5F5A]/90 shadow-lg ring-1 ring-[#10E5C4]/40">
              <Anchor className="h-5 w-5 text-white" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <div className="text-[22px] font-bold tracking-[0.14em] text-white">SEAPHORE</div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#10E5C4]">
                Maritime Intelligence OS
              </div>
            </div>
          </div>

          <div className="h-12 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent" />

          <div className="flex items-center gap-3">
            <img
              src={nimasaLogo.url}
              alt="NIMASA — Nigerian Maritime Administration and Safety Agency"
              className="h-12 w-12 shrink-0 object-contain [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.55))]"
              loading="eager"
              decoding="async"
            />
            <div className="leading-tight">
              <div className="text-[13px] font-bold tracking-wide text-white">NIMASA</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/60">
                Nigerian Maritime Administration
                <br />
                and Safety Agency
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[640px]">
          <h1 className="text-[46px] font-semibold leading-[1.05] tracking-tight text-white xl:text-[54px]">
            Nigeria's Maritime
            <br />
            Intelligence <span className="text-[#10E5C4]">Operating System</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            Real-time maritime domain awareness.
            <br />
            Actionable intelligence.
            <span className="ml-2 text-white/90">Officer decides.</span>
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 xl:grid-cols-6 xl:gap-3">
            {KPI_CARDS.map((k) => {
              const Icon = k.icon;
              const live = intelligenceMetrics?.[k.metricKey];
              const value = live?.display ?? k.fallback;
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
                    {value}
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

        {/* Live operational status */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {OPS_STATUS.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.label}
                className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#0A1424]/60 px-3 py-2.5 backdrop-blur-md"
              >
                <div className="relative">
                  <Icon className="h-4 w-4 text-[#10E5C4]" />
                  <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#10E5C4] shadow-[0_0_8px_#10E5C4] animate-pulse" />
                </div>
                <div className="leading-tight">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                    {t.label}
                  </div>
                  <div className="text-[9px] text-white/60">{t.state}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating overlays */}
      <div className="pointer-events-none absolute bottom-[24%] left-[36%] z-[5] hidden xl:block">
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

      {/* ============== RIGHT PANEL ============== */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10 lg:px-8">
        <div className={cn("w-full", isDev ? "max-w-[560px]" : "max-w-[440px]")}>
          <div className="rounded-2xl border border-white/10 bg-[#0A1424]/80 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-[#10E5C4]/40 bg-[#10E5C4]/10 text-[#10E5C4]">
                {isDev ? <Radar className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#10E5C4]/30 bg-[#10E5C4]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[#10E5C4]">
                {isDev && (
                  <span className="rounded-full bg-[#10E5C4]/20 px-1.5 py-0.5 text-[9px] tracking-widest text-[#10E5C4]">
                    DEV
                  </span>
                )}
                Mission Access
              </div>
              <h2 className="mt-3 text-[24px] font-semibold text-white">
                {isDev ? "Select Your Role" : "Maritime Intelligence OS"}
              </h2>
              <p className="mt-1 text-[12.5px] text-white/60">
                {isDev
                  ? "Preview mode · One-click access, no credentials required"
                  : "Authorized NIMASA Personnel Only"}
              </p>
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
            ) : isDev ? (
              /* ========== PREVIEW · MISSION ACCESS ROLE CARDS ========== */
              <div className="space-y-3">
                {MISSION_ROLES.map((r) => {
                  const Icon = r.icon;
                  const loading = devLoading === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      disabled={!!devLoading}
                      onClick={() => handleMissionAccess(r.key)}
                      className={cn(
                        "group relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4 text-left transition-all duration-200",
                        "hover:-translate-y-0.5 hover:border-[#10E5C4]/60 hover:bg-[#10E5C4]/[0.06] hover:shadow-[0_20px_40px_-18px_rgba(16,229,196,0.55)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10E5C4]/60",
                        "disabled:cursor-wait disabled:opacity-60",
                      )}
                    >
                      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#10E5C4] to-[#12B39A] opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#10E5C4]/30 bg-[#10E5C4]/10 text-[#10E5C4]">
                          <span aria-hidden className="text-[18px] leading-none">
                            {r.glyph}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-[14px] font-semibold text-white">{r.label}</div>
                            <Icon className="h-3.5 w-3.5 text-[#10E5C4]/80" />
                          </div>
                          <div className="text-[11px] font-medium uppercase tracking-wider text-[#10E5C4]">
                            {r.tagline}
                          </div>
                          <p className="mt-1.5 text-[12px] leading-snug text-white/65">
                            {r.description}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                              {r.badge}
                            </span>
                            <span className="rounded-full border border-[#10E5C4]/25 bg-[#10E5C4]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#10E5C4]">
                              → {r.dashboard}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 shrink-0">
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#10E5C4]" />
                          ) : (
                            <ArrowRight className="h-4 w-4 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[#10E5C4]" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[10.5px] leading-relaxed text-white/50">
                  <Network className="h-3 w-3" />
                  Preview only · Authentication bypass is disabled in production builds.
                </p>
              </div>
            ) : (
              /* ========== PRODUCTION · CREDENTIAL LOGIN ========== */
              <>
                <div className="mb-5 grid grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-black/20 p-1.5">
                  {MISSION_ROLES.map((r) => {
                    const Icon = r.icon;
                    const active = prodRole === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setProdRole(r.key)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-[10.5px] font-semibold transition-all",
                          active
                            ? "border border-[#10E5C4]/50 bg-[#10E5C4]/10 text-[#10E5C4] shadow-[0_0_20px_-8px_rgba(16,229,196,0.6)]"
                            : "text-white/60 hover:bg-white/5 hover:text-white/90",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {r.key === "officer" ? "Officer" : r.label}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
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
                    <button type="button" className="font-semibold text-[#10E5C4] hover:underline">
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

          {isDev && !mfa && (
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/50">
              <UserCog className="h-3 w-3 text-[#10E5C4]" />
              After sign-in, use the floating Role Switcher (bottom-right) to change roles instantly.
              <Activity className="h-3 w-3 text-[#10E5C4]" />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-6 py-3 text-[10.5px] uppercase tracking-widest text-white/50 lg:px-12">
        <span>© 2026 NIMASA. All rights reserved.</span>
        <span className="hidden items-center gap-2 md:flex">
          <Anchor className="h-3 w-3 text-[#10E5C4]" />
          Evidence first. Explainable always. Officer decides.
        </span>
        <span className="hidden items-center gap-2 md:flex">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-gradient-to-b from-[#008751] via-white to-[#008751]" />
          Securing Nigeria's Maritime Domain
        </span>
      </div>
    </div>
  );
}
