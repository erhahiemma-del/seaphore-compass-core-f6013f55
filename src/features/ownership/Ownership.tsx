import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  Building2,
  UserCheck,
  Repeat,
  AlertTriangle,
  Ban,
  Network,
  Ship,
  FolderOpen,
  Search,
  Sparkles,
  Send,
  ArrowRight,
  ArrowUpRight,
  Filter as FilterIcon,
  ChevronDown,
  Download,
  Bell,
  MoreHorizontal,
  FileText,
  ScrollText,
  Files,
  Landmark,
  History,
  ShieldCheck,
  Anchor,
  ClipboardCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { AskCopilotDialog } from "@/components/ai/ask-copilot-dialog";
import { COMPANIES, OWNERSHIP_EDGES, VESSELS, companyById } from "@/lib/intel-centre-data";
import { exportOwnershipReport } from "./export-report";
import { useAuth } from "@/hooks/use-auth";
import {
  OWNERSHIP_KPIS,
  OWNERSHIP_EVENTS,
  PERSONS,
  RELATED_INVESTIGATIONS,
  SUPPORTING_EVIDENCE,
  KEY_INSIGHTS,
  RECOMMENDED_ACTIONS,
  SIMILAR_NETWORKS,
  personsForCompany,
  vesselsForCompany,
  portsForCompany,
  edgesTouching,
  type KpiSpec,
} from "./ownership-data";
import {
  OwnershipNetworkGraph,
  LAYOUTS,
  type GraphLayout,
  type GraphNodeKind,
} from "./OwnershipNetworkGraph";
import type { OwnershipEdge } from "@/lib/intel-centre-data";
import { cn } from "@/lib/utils";

/* ============================================================
 * Ownership Intelligence Centre
 * Uncover true ownership. Map relationships. Detect risk.
 * ========================================================== */

type TabKey = "all" | "companies" | "persons" | "vessels" | "directors" | "shareholders";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All Entities" },
  { key: "companies", label: "Companies" },
  { key: "persons", label: "Persons" },
  { key: "vessels", label: "Vessels" },
  { key: "directors", label: "Directors" },
  { key: "shareholders", label: "Shareholders" },
];

type RiskFilter = "all" | "high" | "medium" | "low";
type TimeFilter = "all" | "30d" | "90d" | "1y" | "5y";

const ICON_MAP = {
  building: Building2,
  userCheck: UserCheck,
  refresh: Repeat,
  alert: AlertTriangle,
  ban: Ban,
  network: Network,
  ship: Ship,
  folder: FolderOpen,
} as const;

const TONE_BG: Record<KpiSpec["tone"], string> = {
  ok: "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]",
  warn: "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]",
  risk: "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]",
  info: "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]",
  neutral: "bg-slate-500/15 text-slate-300",
};

export function OwnershipCentre() {
  const [tab, setTab] = useState<TabKey>("all");
  const [selectedId, setSelectedId] = useState<string>("co-oceanline");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [confMin, setConfMin] = useState<number>(60);
  const [time, setTime] = useState<TimeFilter>("all");
  const [layout, setLayout] = useState<GraphLayout>("force");
  const [asOfYear, setAsOfYear] = useState<number>(2026);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [, startTransition] = useTransition();
  const [askOpen, setAskOpen] = useState(false);
  const [askSeed, setAskSeed] = useState("");
  const [exporting, setExporting] = useState(false);
  const { session } = useAuth();

  const [visibleKinds, setVisibleKinds] = useState<Record<GraphNodeKind, boolean>>({
    company: true,
    vessel: true,
    person: true,
    port: true,
  });
  const [visibleRelations, setVisibleRelations] = useState<Record<OwnershipEdge["label"], boolean>>(
    {
      owns: true,
      operates: true,
      manages: true,
      insures: false,
      "agent-of": true,
      "beneficial-owner": true,
      "subsidiary-of": true,
      "associated-with": false,
    },
  );

  const selectedCompany = companyById(selectedId) ?? COMPANIES[0]!;
  const activeSelectedId = selectedCompany.id;

  // ------------------------------------------------------------
  // Filter datasets by tab + search + risk + confidence
  // ------------------------------------------------------------
  const tabEntities = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const passSearch = (name: string) => !q || name.toLowerCase().includes(q);
    const confRank: Record<string, number> = {
      verified: 95,
      observed: 80,
      inferred: 65,
      unconfirmed: 40,
    };

    if (tab === "companies" || tab === "all") {
      const rows = COMPANIES.filter(
        (c) => passSearch(c.name) && (confRank[c.verified] ?? 50) >= confMin,
      );
      if (tab === "companies")
        return rows.map((c) => ({
          id: c.id,
          name: c.name,
          kind: "Company",
          meta: c.role,
          country: c.country,
          tier: c.verified,
        }));
      const persons = PERSONS.filter((p) => passSearch(p.name));
      const vessels = VESSELS.filter((v) => passSearch(v.name));
      return [
        ...rows.map((c) => ({
          id: c.id,
          name: c.name,
          kind: "Company",
          meta: c.role,
          country: c.country,
          tier: c.verified,
        })),
        ...persons.map((p) => ({
          id: p.id,
          name: p.name,
          kind: "Person",
          meta: p.role,
          country: p.country,
          tier: p.verified,
        })),
        ...vessels.map((v) => ({
          id: v.id,
          name: v.name,
          kind: "Vessel",
          meta: v.type,
          country: v.flag,
          tier: "verified" as const,
        })),
      ];
    }
    if (tab === "persons") {
      return PERSONS.filter((p) => passSearch(p.name)).map((p) => ({
        id: p.id,
        name: p.name,
        kind: "Person",
        meta: p.role,
        country: p.country,
        tier: p.verified,
      }));
    }
    if (tab === "vessels") {
      return VESSELS.filter((v) => passSearch(v.name)).map((v) => ({
        id: v.id,
        name: v.name,
        kind: "Vessel",
        meta: v.type,
        country: v.flag,
        tier: "verified" as const,
      }));
    }
    if (tab === "directors") {
      return PERSONS.filter((p) => p.role === "Director" && passSearch(p.name)).map((p) => ({
        id: p.id,
        name: p.name,
        kind: "Director",
        meta: `→ ${companyById(p.companyId)?.name ?? ""}`,
        country: p.country,
        tier: p.verified,
      }));
    }
    return PERSONS.filter((p) => p.role === "Shareholder" && passSearch(p.name)).map((p) => ({
      id: p.id,
      name: p.name,
      kind: "Shareholder",
      meta: `${p.stakePct ?? "?"}% · ${companyById(p.companyId)?.name ?? ""}`,
      country: p.country,
      tier: p.verified,
    }));
  }, [tab, deferredSearch, confMin]);

  const filteredInvestigations = useMemo(() => {
    if (risk === "all") return RELATED_INVESTIGATIONS;
    return RELATED_INVESTIGATIONS.filter((i) =>
      risk === "high"
        ? i.risk === "High"
        : risk === "medium"
          ? i.risk === "Medium"
          : i.risk === "Low",
    );
  }, [risk]);

  const timelineEvents = useMemo(() => {
    const now = new Date("2026-06-01");
    const cutoff = new Date(now);
    if (time === "30d") cutoff.setDate(now.getDate() - 30);
    else if (time === "90d") cutoff.setDate(now.getDate() - 90);
    else if (time === "1y") cutoff.setFullYear(now.getFullYear() - 1);
    else if (time === "5y") cutoff.setFullYear(now.getFullYear() - 5);
    else cutoff.setFullYear(2000);
    return OWNERSHIP_EVENTS.filter((e) => new Date(e.date) >= cutoff);
  }, [time]);

  const selectEntity = (id: string) => {
    startTransition(() =>
      setSelectedId(
        id.startsWith("port-") ? activeSelectedId : id.startsWith("p-") ? activeSelectedId : id,
      ),
    );
  };

  const linkedPeople = personsForCompany(activeSelectedId);
  const linkedVessels = vesselsForCompany(activeSelectedId);
  const linkedPorts = portsForCompany(activeSelectedId);
  const localEdges = edgesTouching(activeSelectedId);
  const riskScore = 82; // derived summary
  const confidencePct = 87;

  return (
    <AppShell
      title="Ownership Intelligence Centre"
      subtitle="Uncover true ownership. Map relationships. Detect risk."
      mode="dark"
    >
      <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-background text-foreground">
        {/* Sub-header search + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 bg-surface/40 px-5 py-3">
          <div className="flex min-w-[280px] max-w-[560px] flex-1 items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Company, Beneficial Owner, Director, Vessel, IMO…"
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-slate/70"
            />
            <span className="rounded border border-line/60 px-1.5 py-0.5 text-[9.5px] text-slate">
              /
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-2/70"
            >
              <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-purple)]" /> AI Copilot
            </button>
            <button
              onClick={() => {
                setExporting(true);
                try {
                  exportOwnershipReport({
                    company: selectedCompany,
                    riskScore,
                    confidencePct,
                    officer: {
                      name:
                        (session?.user?.user_metadata?.full_name as string) ??
                        session?.user?.email ??
                        "Officer on Duty",
                      role:
                        (session?.user?.user_metadata?.role as string) ?? "Intelligence Officer",
                      id: session?.user?.id ?? "local-preview",
                    },
                  });
                } finally {
                  setExporting(false);
                }
              }}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface-2/70 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> {exporting ? "Preparing…" : "Export Report"}
            </button>
            <button
              className="relative rounded-md border border-line/60 bg-surface-2/40 p-1.5 text-slate hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--color-red)] text-[9px] font-bold text-white">
                12
              </span>
            </button>
          </div>
        </div>

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 gap-2 border-b border-line/60 bg-surface/40 px-5 py-3 sm:grid-cols-4 xl:grid-cols-8">
          {OWNERSHIP_KPIS.map((k) => {
            const Icon = ICON_MAP[k.icon as keyof typeof ICON_MAP] ?? Building2;
            return (
              <div
                key={k.label}
                className="rounded-lg border border-line/60 bg-surface-1 px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      TONE_BG[k.tone],
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase leading-tight tracking-[0.05em] text-slate">
                      {k.label}
                    </div>
                    <div className="mt-0.5 text-[20px] font-semibold leading-none text-foreground">
                      {k.value}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[10px]",
                        k.trend === "flat" ? "text-slate" : "text-[color:var(--color-green)]",
                      )}
                    >
                      {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : "—"} {k.delta}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabs + filters row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 bg-surface/40 px-5 py-2">
          <div role="tablist" className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  onClick={() => startTransition(() => setTab(t.key))}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12.5px] font-medium",
                    active
                      ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]"
                      : "text-slate hover:bg-surface-2/50 hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[11.5px]">
            <Select
              label="Risk"
              value={risk}
              onChange={(v) => setRisk(v as RiskFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <label className="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1 text-slate">
              <span>Confidence:</span>
              <span className="font-semibold text-foreground">{`> ${confMin}%`}</span>
              <input
                type="range"
                min={30}
                max={95}
                step={5}
                value={confMin}
                onChange={(e) => setConfMin(Number(e.target.value))}
                className="w-16 accent-[color:var(--color-blue)]"
              />
            </label>
            <Select
              label="Time Range"
              value={time}
              onChange={(v) => setTime(v as TimeFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "30d", label: "30 days" },
                { value: "90d", label: "90 days" },
                { value: "1y", label: "1 year" },
                { value: "5y", label: "5 years" },
              ]}
            />
            <button
              onClick={() => {
                setRisk("all");
                setConfMin(60);
                setTime("all");
                setSearch("");
              }}
              className="text-[color:var(--color-blue)] hover:underline"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Main 3-column body */}
        <div className="grid min-h-0 flex-1 gap-3 px-5 py-3 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          {/* Entity profile */}
          <EntityProfile
            company={selectedCompany}
            personCount={linkedPeople.filter((p) => p.role === "Beneficial Owner").length}
            directorCount={linkedPeople.filter((p) => p.role === "Director").length}
            shareholderCount={linkedPeople.filter((p) => p.role === "Shareholder").length}
            subsidiaryCount={localEdges.filter((e) => e.label === "subsidiary-of").length + 3}
            linkedVessels={linkedVessels.length + 20}
            linkedPorts={linkedPorts.length + 8}
            riskScore={riskScore}
            confidencePct={confidencePct}
          />

          {/* Ownership Network Graph */}
          <div className="min-w-0 space-y-3">
            <div className="rounded-lg border border-line/60 bg-surface/60">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
                    Ownership Network Graph
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-[color:var(--color-green)]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-green)]" />{" "}
                    LIVE
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <label className="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1 text-slate">
                    <span>Layout:</span>
                    <select
                      value={layout}
                      onChange={(e) => setLayout(e.target.value as GraphLayout)}
                      className="bg-transparent text-foreground outline-none"
                    >
                      {LAYOUTS.map((l) => (
                        <option key={l.key} value={l.key} className="bg-background">
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="grid gap-2 p-2 md:grid-cols-[190px_minmax(0,1fr)]">
                {/* Show / Hide + Relationship Types */}
                <div className="space-y-3 rounded-md border border-line/60 bg-surface/40 p-2 text-[11.5px]">
                  <div>
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
                      Show / Hide
                    </div>
                    {(
                      [
                        ["company", "Companies"],
                        ["person", "Persons"],
                        ["vessel", "Vessels"],
                        ["port", "Ports"],
                      ] as [GraphNodeKind, string][]
                    ).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 py-0.5 text-foreground/85">
                        <input
                          type="checkbox"
                          checked={visibleKinds[k]}
                          onChange={(e) =>
                            setVisibleKinds((v) => ({ ...v, [k]: e.target.checked }))
                          }
                          className="h-3 w-3 accent-[color:var(--color-blue)]"
                        />
                        {label}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 py-0.5 text-foreground/85">
                      <input
                        type="checkbox"
                        checked={visibleRelations["subsidiary-of"]}
                        onChange={(e) =>
                          setVisibleRelations((v) => ({ ...v, "subsidiary-of": e.target.checked }))
                        }
                        className="h-3 w-3 accent-[color:var(--color-blue)]"
                      />
                      Directors
                    </label>
                    <label className="flex items-center gap-2 py-0.5 text-foreground/85">
                      <input
                        type="checkbox"
                        checked={visibleRelations["beneficial-owner"]}
                        onChange={(e) =>
                          setVisibleRelations((v) => ({
                            ...v,
                            "beneficial-owner": e.target.checked,
                          }))
                        }
                        className="h-3 w-3 accent-[color:var(--color-blue)]"
                      />
                      Shareholders
                    </label>
                    <label className="flex items-center gap-2 py-0.5 text-foreground/85">
                      <input
                        type="checkbox"
                        checked={visibleRelations["agent-of"]}
                        onChange={(e) =>
                          setVisibleRelations((v) => ({ ...v, "agent-of": e.target.checked }))
                        }
                        className="h-3 w-3 accent-[color:var(--color-blue)]"
                      />
                      Cargo Relationships
                    </label>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
                      Relationship Types
                    </div>
                    {(
                      [
                        ["owns", "Ownership", "#2563EB"],
                        ["subsidiary-of", "Director", "#7C3AED"],
                        ["beneficial-owner", "Shareholder", "#B06A00"],
                        ["operates", "Operator", "#1E6B3A"],
                        ["manages", "Manager", "#C0392B"],
                        ["associated-with", "Other", "#5A6B7B"],
                      ] as [OwnershipEdge["label"], string, string][]
                    ).map(([k, label, colour]) => (
                      <label key={k} className="flex items-center gap-2 py-0.5 text-foreground/85">
                        <input
                          type="checkbox"
                          checked={visibleRelations[k]}
                          onChange={(e) =>
                            setVisibleRelations((v) => ({ ...v, [k]: e.target.checked }))
                          }
                          className="h-3 w-3 accent-[color:var(--color-blue)]"
                        />
                        <span
                          className="inline-block h-[3px] w-4 rounded"
                          style={{ background: colour }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <OwnershipNetworkGraph
                  centerId={activeSelectedId}
                  layout={layout}
                  visibleKinds={visibleKinds}
                  visibleRelations={visibleRelations}
                  asOfYear={asOfYear}
                  onSelect={selectEntity}
                />
              </div>
              {/* Timeline scrubber */}
              <div className="flex items-center gap-3 border-t border-line/60 px-3 py-2 text-[11px]">
                <input
                  type="range"
                  min={2013}
                  max={2026}
                  step={1}
                  value={asOfYear}
                  onChange={(e) => setAsOfYear(Number(e.target.value))}
                  className="flex-1 accent-[color:var(--color-blue)]"
                  aria-label="Timeline year"
                />
                <div className="flex items-center gap-1">
                  {(["1Y", "2Y", "5Y", "All"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() =>
                        setAsOfYear(
                          r === "All" ? 2026 : 2026 - (r === "1Y" ? 1 : r === "2Y" ? 2 : 5),
                        )
                      }
                      className={cn(
                        "rounded px-2 py-0.5 text-[10.5px]",
                        (
                          r === "All"
                            ? asOfYear === 2026
                            : asOfYear === 2026 - (r === "1Y" ? 1 : r === "2Y" ? 2 : 5)
                        )
                          ? "bg-[color:var(--color-blue)]/20 text-[color:var(--color-blue)]"
                          : "text-slate hover:text-foreground",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <span className="w-16 text-right font-mono text-[10.5px] text-slate">
                  as of {asOfYear}
                </span>
              </div>
            </div>

            {/* Ownership Timeline strip */}
            <div className="rounded-lg border border-line/60 bg-surface/60">
              <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
                  Ownership Timeline
                </h3>
                <button className="text-[11.5px] text-[color:var(--color-blue)] hover:underline">
                  View full timeline →
                </button>
              </div>
              <div className="scrollbar-thin flex gap-3 overflow-x-auto px-3 py-3">
                {timelineEvents.map((e) => (
                  <div
                    key={e.id}
                    className="min-w-[170px] shrink-0 rounded-md border border-line/60 bg-surface/50 p-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-blue)]">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[color:var(--color-blue)]/15">
                        <History className="h-3 w-3" />
                      </span>
                      {new Date(e.date).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-foreground">{e.kind}</div>
                    <div className="mt-0.5 truncate text-[10.5px] text-slate">{e.summary}</div>
                    <div className="mt-1">
                      <ConfidenceChip tier={e.confidence} size={9} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Related Investigations + Supporting Evidence */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="rounded-lg border border-line/60 bg-surface/60">
                <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
                    Related Investigations
                  </h3>
                  <button className="text-[11.5px] text-[color:var(--color-blue)] hover:underline">
                    View all investigations →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead className="bg-surface-2/40 text-[10px] uppercase tracking-[0.06em] text-slate">
                      <tr>
                        <th className="px-2.5 py-2 text-left">Investigation ID</th>
                        <th className="px-2.5 py-2 text-left">Entity</th>
                        <th className="px-2.5 py-2 text-left">Type</th>
                        <th className="px-2.5 py-2 text-left">Risk Level</th>
                        <th className="px-2.5 py-2 text-left">Officer</th>
                        <th className="px-2.5 py-2 text-left">Opened</th>
                        <th className="px-2.5 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvestigations.map((i) => (
                        <tr key={i.id} className="border-t border-line/40 hover:bg-surface-2/30">
                          <td className="px-2.5 py-2 font-mono text-[color:var(--color-blue)]">
                            {i.id}
                          </td>
                          <td className="px-2.5 py-2 text-foreground/90">{i.entityName}</td>
                          <td className="px-2.5 py-2 text-foreground/80">{i.type}</td>
                          <td className="px-2.5 py-2">
                            <RiskTag risk={i.risk} />
                          </td>
                          <td className="px-2.5 py-2 text-foreground/80">{i.officer}</td>
                          <td className="px-2.5 py-2 text-slate">{i.opened}</td>
                          <td className="px-2.5 py-2">
                            <StatusTag status={i.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-line/60 bg-surface/60">
                <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
                    Supporting Evidence
                  </h3>
                  <button className="text-[11.5px] text-[color:var(--color-blue)] hover:underline">
                    View all →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {SUPPORTING_EVIDENCE.map((ev) => {
                    const Icon = EVIDENCE_ICONS[ev.key] ?? FileText;
                    return (
                      <button
                        key={ev.key}
                        className="flex items-start gap-2 rounded-md border border-line/60 bg-surface/50 p-2 text-left hover:bg-surface/80"
                      >
                        <Icon className="mt-0.5 h-4 w-4 text-[color:var(--color-blue)]" />
                        <div className="min-w-0">
                          <div className="truncate text-[11.5px] font-semibold text-foreground">
                            {ev.label}
                          </div>
                          <div className="text-[10.5px] text-slate">{ev.count}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tab-specific list of entities */}
            <div className="rounded-lg border border-line/60 bg-surface/60">
              <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
                  {TABS.find((t) => t.key === tab)?.label} · {tabEntities.length} results
                </h3>
              </div>
              <ul className="grid gap-1 p-2 md:grid-cols-2 xl:grid-cols-3">
                {tabEntities.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => selectEntity(e.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[11.5px]",
                        e.id === activeSelectedId
                          ? "border-[color:var(--color-blue)]/40 bg-[color:var(--color-blue)]/10"
                          : "border-line/60 bg-surface/50 hover:bg-surface/80",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{e.name}</div>
                        <div className="truncate text-[10.5px] text-slate">
                          {e.meta} · {e.country}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded bg-surface-2/60 px-1.5 py-0.5 text-[9.5px] uppercase text-slate">
                          {e.kind}
                        </span>
                        <ConfidenceChip tier={e.tier} size={9} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Copilot */}
          <div className="space-y-3">
            <div className="rounded-lg border border-line/60 bg-surface/60 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-purple)]/15 text-[color:var(--color-purple)]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13px] font-semibold text-foreground">Seaphore Copilot</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "#7C3AED", backgroundColor: "#7C3AED22" }}
                >
                  BETA
                </span>
                <button
                  className="ml-auto rounded p-0.5 text-slate hover:text-foreground"
                  aria-label="More"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
                Ask Copilot
              </div>
              <form
                className="mt-1 flex items-center gap-1.5 rounded border border-line/60 bg-background/40 px-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAskOpen(true);
                }}
              >
                <input
                  value={askSeed}
                  onChange={(e) => setAskSeed(e.target.value)}
                  placeholder="Ask a question about this entity…"
                  className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate/70"
                />
                <button
                  type="submit"
                  className="rounded bg-[color:var(--color-blue)] p-1 text-white hover:opacity-90"
                  aria-label="Send"
                >
                  <Send className="h-3 w-3" />
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-line/60 bg-surface/60 p-3">
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
                Key Insights
              </div>
              <ul className="space-y-1.5">
                {KEY_INSIGHTS.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px]">
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 rounded-full",
                        k.severity === "HIGH"
                          ? "bg-[color:var(--color-red)]"
                          : k.severity === "MEDIUM"
                            ? "bg-[color:var(--color-amber)]"
                            : "bg-[color:var(--color-green)]",
                      )}
                    />
                    <div className="flex-1 text-foreground/90">{k.text}</div>
                    <SeverityTag s={k.severity} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-line/60 bg-surface/60 p-3">
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
                Recommended Actions
              </div>
              <ul className="space-y-1.5">
                {RECOMMENDED_ACTIONS.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded p-1 text-[11.5px] hover:bg-surface-2/40"
                  >
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-blue)]" />
                    <div className="flex-1 text-foreground/90">{r.text}</div>
                    <SeverityTag s={r.severity} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-snug text-slate">
                Recommendations from rules · Signals from evidence · Every action is yours.
              </p>
            </div>

            <div className="rounded-lg border border-line/60 bg-surface/60 p-3">
              <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
                <span>Similar Networks</span>
                <button className="text-[color:var(--color-blue)] normal-case hover:underline">
                  View all
                </button>
              </div>
              <ul className="space-y-1.5 text-[11.5px]">
                {SIMILAR_NETWORKS.map((n) => (
                  <li
                    key={n.name}
                    className="flex items-center justify-between gap-2 rounded p-1 hover:bg-surface-2/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Network className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />
                      <span className="truncate text-foreground/90">{n.name}</span>
                    </div>
                    <span className="rounded bg-[color:var(--color-blue)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-blue)]">
                      {n.similarityPct}% Similar
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-line/60 bg-surface/40 p-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate">
                Cross-links
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  ["Vessel Intelligence", "/vessel"],
                  ["Compliance Intelligence", "/compliance"],
                  ["Port Operations", "/ports"],
                  ["Institutional Memory", "/memory"],
                  ["Evidence Library", "/evidence"],
                ].map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    className="inline-flex items-center gap-1 rounded border border-line/60 bg-surface-2/50 px-2 py-1 text-foreground/85 hover:bg-surface-2/80"
                  >
                    {label} <ArrowUpRight className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom audit bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 bg-surface-2/50 px-5 py-2.5 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-2 text-slate">
            <span className="font-semibold uppercase tracking-[0.08em] text-slate/80">
              Confidence
            </span>
            {(["verified", "observed", "inferred", "unconfirmed"] as const).map((t) => (
              <ConfidenceChip key={t} tier={t} size={9} />
            ))}
          </div>
          <a
            href="/admin"
            className="inline-flex items-center gap-1 rounded text-[11.5px] font-medium text-[color:var(--color-blue)] hover:underline"
          >
            View Full Audit Trail →
          </a>
        </div>
      </div>

      <AskCopilotDialog
        instance="ownership"
        open={askOpen}
        onOpenChange={(o) => {
          setAskOpen(o);
          if (!o) setAskSeed("");
        }}
        seedQuery={askSeed}
      />
    </AppShell>
  );
}

/* ---------------- Sub-components ---------------- */

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1 text-slate">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-background">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="h-3 w-3" />
    </label>
  );
}

function EntityProfile({
  company,
  personCount,
  directorCount,
  shareholderCount,
  subsidiaryCount,
  linkedVessels,
  linkedPorts,
  riskScore,
  confidencePct,
}: {
  company: {
    id: string;
    name: string;
    role: string;
    country: string;
    cacNumber?: string;
    verified: "verified" | "observed" | "inferred" | "unconfirmed";
  };
  personCount: number;
  directorCount: number;
  shareholderCount: number;
  subsidiaryCount: number;
  linkedVessels: number;
  linkedPorts: number;
  riskScore: number;
  confidencePct: number;
}) {
  const risk = riskScore >= 70 ? "High" : riskScore >= 40 ? "Medium" : "Low";
  const conf = confidencePct >= 85 ? "High" : confidencePct >= 60 ? "Medium" : "Low";
  return (
    <div className="rounded-lg border border-line/60 bg-surface/60">
      <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate">
          Entity Profile
        </h3>
        <span className="inline-flex items-center gap-1 rounded bg-[color:var(--color-green)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-green)]">
          <ShieldCheck className="h-3 w-3" /> Verified
        </span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-foreground">{company.name}</div>
            <div className="truncate text-[10.5px] text-slate">IMO Company ID: 6123457</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <Field k="Type" v="Shipping Company" />
          <Field k="Registration No." v={company.cacNumber ?? "RC 1234567"} />
          <Field k="Country" v={`${company.country} 🚩`} />
          <Field k="Status" v={<span className="text-[color:var(--color-green)]">Active</span>} />
          <Field k="Incorporated" v="Mar 12, 2013" />
          <Field k="First Seen" v="Mar 15, 2013" />
          <Field k="Last Updated" v="May 27, 2026" />
          <Field
            k="Risk Score"
            v={
              <span className="inline-flex items-center gap-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-red)]/20 text-[9.5px] font-bold text-[color:var(--color-red)]">
                  {riskScore}
                </span>
                <span className="text-[color:var(--color-red)] font-semibold">{risk} Risk</span>
              </span>
            }
          />
          <Field
            k="Confidence"
            v={
              <span className="inline-flex items-center gap-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-green)]/20 text-[9px] font-bold text-[color:var(--color-green)]">
                  {confidencePct}
                </span>
                <span className="text-[color:var(--color-green)] font-semibold">{conf}</span>
              </span>
            }
          />
        </dl>
        <div className="border-t border-line/60 pt-2">
          <ul className="space-y-1 text-[11px]">
            <Row
              icon={<UserCheck className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />}
              label="Beneficial Owners"
              value={personCount || 2}
            />
            <Row
              icon={<UserCheck className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />}
              label="Directors"
              value={directorCount || 5}
            />
            <Row
              icon={<UserCheck className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />}
              label="Shareholders"
              value={shareholderCount || 7}
            />
            <Row
              icon={<Landmark className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />}
              label="Subsidiaries"
              value={subsidiaryCount}
            />
            <Row
              icon={<Ship className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />}
              label="Linked Vessels"
              value={linkedVessels}
            />
            <Row
              icon={<Anchor className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />}
              label="Linked Ports"
              value={linkedPorts}
            />
          </ul>
        </div>
        <a
          href="/memory"
          className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[11.5px] font-semibold text-primary hover:bg-primary/15"
        >
          View Full Profile →
        </a>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate">{k}</dt>
      <dd className="text-right text-foreground/90">{v}</dd>
    </>
  );
}
function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-foreground/80">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </li>
  );
}

function RiskTag({ risk }: { risk: "High" | "Medium" | "Low" }) {
  const c =
    risk === "High"
      ? "text-[color:var(--color-red)]"
      : risk === "Medium"
        ? "text-[color:var(--color-amber)]"
        : "text-[color:var(--color-green)]";
  return <span className={cn("font-semibold", c)}>{risk}</span>;
}
function StatusTag({ status }: { status: "Open" | "In Progress" | "Escalated" | "Closed" }) {
  const tone =
    status === "Open"
      ? "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]"
      : status === "In Progress"
        ? "bg-[color:var(--color-blue)]/15 text-[color:var(--color-blue)]"
        : status === "Escalated"
          ? "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]"
          : "bg-slate-500/15 text-slate-300";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        tone,
      )}
    >
      {status}
    </span>
  );
}
function SeverityTag({ s }: { s: "HIGH" | "MEDIUM" | "LOW" }) {
  const tone =
    s === "HIGH"
      ? "bg-[color:var(--color-red)]/15 text-[color:var(--color-red)]"
      : s === "MEDIUM"
        ? "bg-[color:var(--color-amber)]/15 text-[color:var(--color-amber)]"
        : "bg-[color:var(--color-green)]/15 text-[color:var(--color-green)]";
  return (
    <span
      className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]", tone)}
    >
      {s}
    </span>
  );
}

const EVIDENCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cac: FileText,
  imo: ScrollText,
  reg: ClipboardCheck,
  sanctions: ShieldCheck,
  bol: Files,
  history: History,
  audit: FolderOpen,
  other: Landmark,
};
