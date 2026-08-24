import { useMemo, useState, useEffect } from "react";
import {
  AlertTriangle,
  Search,
  Bell,
  ShieldAlert,
  CheckCircle2,
  FolderOpen,
  XCircle,
  Clock,
  ArrowUpRight,
  List as ListIcon,
  Calendar as CalendarIcon,
  Columns3,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Filter as FilterIcon,
  Bookmark,
  ChevronDown,
  Send,
  Zap,
  UserPlus,
  FileText,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { ALERTS, vesselById, type AlertItem, type AlertStatus } from "@/lib/intel-centre-data";
import { useAlertsRealtime } from "@/hooks/use-alerts-realtime";
import { PanelLive } from "@/components/intelligence/PanelLive";
import { cn } from "@/lib/utils";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";

/* ============================================================
 * Alerts Center — Maritime Alert Operations Workspace
 * Triage. Prioritize. Act. Close the loop.
 * ============================================================ */

type ViewMode = "list" | "timeline" | "kanban";
type TabKey =
  | "overview"
  | "active"
  | "critical"
  | "acknowledged"
  | "investigations"
  | "timeline"
  | "correlation"
  | "history"
  | "analytics";

interface ExtAlert extends AlertItem {
  alertId: string;
  assignedTo: string;
  riskScore: number;
  imo?: string;
  port?: string;
  company?: string;
  investigationId?: string;
  location?: { lat: number; lng: number };
  firstDetected: string;
}

const OFFICERS = [
  { name: "John Bello", responseTime: "00:28", handled: 143, accuracy: 96 },
  { name: "Mary Akinyemi", responseTime: "00:41", handled: 112, accuracy: 94 },
  { name: "Ibrahim Yusuf", responseTime: "00:53", handled: 98, accuracy: 92 },
  { name: "Samuel Odey", responseTime: "01:02", handled: 76, accuracy: 90 },
  { name: "Grace Nwosu", responseTime: "01:15", handled: 58, accuracy: 88 },
] as const;

// Deterministic seed extension so the queue reflects real operational density.
function buildAlerts(): ExtAlert[] {
  const base: ExtAlert[] = ALERTS.map((a, i) => {
    const v = a.vesselId ? vesselById(a.vesselId) : undefined;
    return {
      ...a,
      alertId: `ALT-2026-${String(845 - i).padStart(6, "0")}`,
      assignedTo: OFFICERS[i % OFFICERS.length].name,
      riskScore: 60 + ((i * 7) % 40),
      imo: v?.imo,
      port: v?.destinationPort,
      company: undefined,
      investigationId: i % 3 === 0 ? `INV-2026-00${430 + i}` : undefined,
      location: { lat: 3.39 + i * 0.02, lng: 6.45 + i * 0.02 },
      firstDetected: a.timeISO,
    };
  });
  // Extend with duplicates for realistic queue length (128 total displayed count).
  return base;
}

const ALL_ALERTS: ExtAlert[] = buildAlerts();

const KPI_STATS = {
  active: 128,
  critical: 24,
  highRisk: 46,
  ack: 38,
  investigations: 32,
  falsePositives: 18,
  avgResponse: "00:37",
  escalations: 6,
} as const;

const TABS: { key: TabKey; label: string; count?: number }[] = [
  { key: "overview", label: "Overview" },
  { key: "active", label: "Active Alerts", count: 128 },
  { key: "critical", label: "Critical", count: 24 },
  { key: "acknowledged", label: "Acknowledged", count: 38 },
  { key: "investigations", label: "Investigations", count: 32 },
  { key: "timeline", label: "Timeline" },
  { key: "correlation", label: "Correlation" },
  { key: "history", label: "History" },
  { key: "analytics", label: "Analytics" },
];

export function AlertsCentre() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string>(ALL_ALERTS[0]?.id ?? "");
  const [statusMap, setStatusMap] = useState<Record<string, AlertStatus>>({});
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "severity" | "risk">("newest");
  const [severityFilter, setSeverityFilter] = useState<string[]>(["High", "Medium", "Low", "Info"]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const decorated = useMemo<ExtAlert[]>(
    () =>
      ALL_ALERTS.map((a) => ({
        ...a,
        status: statusMap[a.id] ?? a.status,
        assignedTo: assignMap[a.id] ?? a.assignedTo,
      })),
    [statusMap, assignMap],
  );

  const filtered = useMemo(() => {
    const sevMap: Record<string, string> = {
      high: "High",
      medium: "Medium",
      low: "Low",
      info: "Info",
    };
    return decorated
      .filter((a) => {
        if (tab === "critical" && a.severity !== "high") return false;
        if (tab === "acknowledged" && a.status !== "ACK") return false;
        if (tab === "active" && a.status === "RESOLVED") return false;
        if (tab === "investigations" && !a.investigationId) return false;
        if (!severityFilter.includes(sevMap[a.severity]!)) return false;
        if (typeFilter.length && !typeFilter.includes(a.type)) return false;
        if (query) {
          const q = query.toLowerCase();
          const hay = `${a.title} ${a.detail} ${a.imo ?? ""} ${a.type}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "newest") return b.timeISO.localeCompare(a.timeISO);
        if (sort === "severity") {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
          return order[a.severity]! - order[b.severity]!;
        }
        return b.riskScore - a.riskScore;
      });
  }, [decorated, tab, severityFilter, typeFilter, query, sort]);

  const selected = decorated.find((a) => a.id === selectedId) ?? filtered[0];

  useEffect(() => {
    if (filtered.length && !filtered.find((a) => a.id === selectedId)) {
      setSelectedId(filtered[0]!.id);
    }
  }, [filtered, selectedId]);

  const setStatus = (id: string, s: AlertStatus) => setStatusMap((p) => ({ ...p, [id]: s }));
  const setAssignee = (id: string, who: string) => setAssignMap((p) => ({ ...p, [id]: who }));

  // Live database stream — mirrors DB updates into workspace state so queue,
  // details, timeline and correlation panels all reflect changes without a refresh.
  const knownAlertIds = useMemo(() => ALL_ALERTS.map((a) => a.alertId), []);
  const live = useAlertsRealtime({
    knownAlertIds,
    onStatusChange: (alertId, next) => {
      const local = ALL_ALERTS.find((a) => a.alertId === alertId);
      if (local) setStatus(local.id, next);
    },
    onAssignChange: (alertId, who) => {
      const local = ALL_ALERTS.find((a) => a.alertId === alertId);
      if (local) setAssignee(local.id, who);
    },
  });

  return (
    <AppShell title="Alerts Center" subtitle="Triage. Prioritize. Act. Close the loop." mode="dark">
      <DemoDataNotice surface="Alerts" className="mb-3" />
      <div className="min-h-full space-y-4 px-6 py-4">
        {/* Global search bar (page-level) */}
        <PageSearchBar query={query} onQuery={setQuery} live={live} />

        {/* KPI Ribbon */}
        <KpiRibbon />

        {/* Tabs + View Switcher + Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-1">
          <div role="tablist" className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <TabButton
                key={t.key}
                active={tab === t.key}
                onClick={() => setTab(t.key)}
                label={t.label}
                count={t.count}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ViewSwitcher value={view} onChange={setView} />
            <SortDropdown value={sort} onChange={setSort} />
          </div>
        </div>

        {/* Main triage row: filters | queue | details */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-3 2xl:col-span-2">
            <FilterSidebar
              severity={severityFilter}
              setSeverity={setSeverityFilter}
              types={typeFilter}
              setTypes={setTypeFilter}
            />
          </div>

          <div className="col-span-12 xl:col-span-5 2xl:col-span-5">
            <AlertQueue
              alerts={filtered}
              total={128}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              live={live}
            />
          </div>

          <div className="col-span-12 xl:col-span-4 2xl:col-span-5">
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-5">
              <div className="2xl:col-span-3">
                {selected && <AlertDetails alert={selected} onStatus={setStatus} live={live} />}
              </div>
              <div className="2xl:col-span-2 space-y-4">
                {selected && <CopilotPanel alert={selected} />}
                {selected && <RecommendedActionsPanel alert={selected} onStatus={setStatus} />}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom analytics row */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <LiveTimeline
              alerts={decorated}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              live={live}
            />
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <CorrelationGraph
              alerts={decorated}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              live={live}
            />
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <SeverityDonut />
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <OfficerPerformance />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ------------- Page search ------------- */
function PageSearchBar({
  query,
  onQuery,
  live,
}: {
  query: string;
  onQuery: (s: string) => void;
  live: ReturnType<typeof useAlertsRealtime>;
}) {
  const dot =
    live.status === "live"
      ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.25)] animate-pulse"
      : live.status === "connecting"
        ? "bg-amber-400"
        : "bg-red-500";
  const label =
    live.status === "live"
      ? `LIVE · ${live.eventCount} update${live.eventCount === 1 ? "" : "s"}`
      : live.status === "connecting"
        ? "Connecting…"
        : "Offline";
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-line/60 bg-surface-1/70 px-3 py-2">
        <Search className="h-4 w-4 text-slate" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search alert, vessel, IMO, company, investigation…"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate/70"
        />
        <kbd className="rounded border border-line/60 px-1.5 py-0.5 text-[10px] text-slate">/</kbd>
      </div>
      <div
        className="inline-flex items-center gap-2 rounded-md border border-line/60 bg-surface-2/40 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate"
        title={
          live.lastEvent
            ? `${live.lastEvent.summary} @ ${new Date(live.lastEvent.at).toLocaleTimeString()}`
            : "Realtime database stream"
        }
      >
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span>{label}</span>
      </div>
      <button className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-blue)]/60 bg-[color:var(--color-blue)]/10 px-3 py-2 text-[12px] font-medium text-[color:var(--color-blue)] hover:bg-[color:var(--color-blue)]/20">
        <Sparkles className="h-3.5 w-3.5" /> AI Copilot
      </button>
      <button className="rounded-md border border-line/60 bg-surface-2/40 p-2 text-slate hover:text-foreground">
        <FilterIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------- KPI Ribbon ------------- */
function KpiRibbon() {
  const items: {
    label: string;
    value: string;
    delta: string;
    tone: "risk" | "warn" | "ok" | "info" | "muted";
    icon: React.ReactNode;
    deltaTone?: "up" | "down";
  }[] = [
    {
      label: "Active Alerts",
      value: String(KPI_STATS.active),
      delta: "↑ 18 vs yesterday",
      tone: "risk",
      deltaTone: "up",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      label: "Critical Alerts",
      value: String(KPI_STATS.critical),
      delta: "↑ 6 vs yesterday",
      tone: "risk",
      deltaTone: "up",
      icon: <ShieldAlert className="h-4 w-4" />,
    },
    {
      label: "High Risk",
      value: String(KPI_STATS.highRisk),
      delta: "↑ 12 vs yesterday",
      tone: "warn",
      deltaTone: "up",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      label: "Acknowledged",
      value: String(KPI_STATS.ack),
      delta: "↑ 5 vs yesterday",
      tone: "info",
      deltaTone: "up",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: "Investigations Opened",
      value: String(KPI_STATS.investigations),
      delta: "↑ 8 vs yesterday",
      tone: "ok",
      deltaTone: "up",
      icon: <FolderOpen className="h-4 w-4" />,
    },
    {
      label: "False Positives",
      value: String(KPI_STATS.falsePositives),
      delta: "↑ 4 vs yesterday",
      tone: "muted",
      deltaTone: "up",
      icon: <XCircle className="h-4 w-4" />,
    },
    {
      label: "Avg Response Time",
      value: KPI_STATS.avgResponse,
      delta: "↓ 12% vs yesterday",
      tone: "ok",
      deltaTone: "down",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      label: "Escalations",
      value: String(KPI_STATS.escalations),
      delta: "↑ 2 vs yesterday",
      tone: "warn",
      deltaTone: "up",
      icon: <ArrowUpRight className="h-4 w-4" />,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {items.map((k) => (
        <KpiTile key={k.label} {...k} />
      ))}
    </div>
  );
}

function KpiTile({
  label,
  value,
  delta,
  tone,
  icon,
  deltaTone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "risk" | "warn" | "ok" | "info" | "muted";
  icon: React.ReactNode;
  deltaTone?: "up" | "down";
}) {
  const iconColor = {
    risk: "text-[color:var(--color-red)] bg-[color:var(--color-red)]/10 border-[color:var(--color-red)]/30",
    warn: "text-[color:var(--color-amber)] bg-[color:var(--color-amber)]/10 border-[color:var(--color-amber)]/30",
    ok: "text-[color:var(--color-green)] bg-[color:var(--color-green)]/10 border-[color:var(--color-green)]/30",
    info: "text-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10 border-[color:var(--color-blue)]/30",
    muted: "text-slate bg-surface-2/60 border-line/60",
  }[tone];
  const deltaColor =
    deltaTone === "down" ? "text-[color:var(--color-green)]" : "text-[color:var(--color-red)]";
  return (
    <div className="rounded-lg border border-line/60 bg-surface-1/70 p-3">
      <div className="flex items-start gap-3">
        <div
          className={cn("flex h-9 w-9 items-center justify-center rounded-full border", iconColor)}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate">{label}</div>
          <div className="mt-0.5 text-[22px] font-semibold leading-none text-foreground">
            {value}
          </div>
          <div className={cn("mt-1.5 text-[10.5px]", deltaColor)}>{delta}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------- Tabs / View switcher / Sort ------------- */
function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative shrink-0 px-3 py-2 text-[12.5px] font-medium transition-colors",
        active ? "text-foreground" : "text-slate hover:text-foreground",
      )}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-1.5 rounded px-1.5 py-0.5 text-[10px]",
            active
              ? "bg-[color:var(--color-blue)]/20 text-[color:var(--color-blue)]"
              : "bg-surface-2/70 text-slate",
          )}
        >
          {count}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-2 -bottom-1 h-[2px] rounded-full bg-[color:var(--color-blue)]" />
      )}
    </button>
  );
}

function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "list", label: "List", icon: <ListIcon className="h-3 w-3" /> },
    { key: "timeline", label: "Timeline", icon: <CalendarIcon className="h-3 w-3" /> },
    { key: "kanban", label: "Kanban", icon: <Columns3 className="h-3 w-3" /> },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line/60 bg-surface-2/40">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px]",
            value === o.key
              ? "bg-[color:var(--color-blue)]/20 text-[color:var(--color-blue)]"
              : "text-slate hover:text-foreground",
          )}
        >
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: "newest" | "severity" | "risk") => void;
}) {
  const label =
    value === "newest" ? "Newest First" : value === "severity" ? "Severity" : "Risk Score";
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "newest" | "severity" | "risk")}
        className="appearance-none rounded-md border border-line/60 bg-surface-2/40 py-1.5 pl-3 pr-8 text-[11.5px] text-foreground outline-none"
      >
        <option value="newest">Sort: Newest First</option>
        <option value="severity">Sort: Severity</option>
        <option value="risk">Sort: Risk Score</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/* ------------- Filter Sidebar ------------- */
function FilterSidebar({
  severity,
  setSeverity,
  types,
  setTypes,
}: {
  severity: string[];
  setSeverity: (s: string[]) => void;
  types: string[];
  setTypes: (s: string[]) => void;
}) {
  const toggle = (arr: string[], set: (s: string[]) => void, val: string) =>
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  return (
    <aside className="rounded-lg border border-line/60 bg-surface-1/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
          Filter Alerts
        </div>
        <button
          onClick={() => {
            setSeverity(["High", "Medium", "Low", "Info"]);
            setTypes([]);
          }}
          className="text-[10.5px] text-[color:var(--color-blue)] hover:underline"
        >
          Clear All
        </button>
      </div>
      <div className="mb-3 flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1.5">
        <Search className="h-3 w-3 text-slate" />
        <input
          placeholder="Search filters..."
          className="w-full bg-transparent text-[11.5px] outline-none placeholder:text-slate/70"
        />
      </div>
      <FilterAccordion label="Severity" defaultOpen>
        <CheckList
          options={["High", "Medium", "Low", "Info"]}
          checked={severity}
          onToggle={(v) => toggle(severity, setSeverity, v)}
        />
      </FilterAccordion>
      <FilterAccordion label="Alert Type">
        <CheckList
          options={[
            "High Risk Arrival",
            "AIS Blackout Observed",
            "Duplicate Manifest Observed",
            "Revenue Discrepancy Observed",
            "Watchlist Match",
            "Dangerous Goods",
            "Late Submission",
          ]}
          checked={types}
          onToggle={(v) => toggle(types, setTypes, v)}
        />
      </FilterAccordion>
      <FilterAccordion label="Source">
        <CheckList
          options={[
            "AIS Network",
            "Customs Feed",
            "OpenSanctions",
            "Manifest Upload",
            "Officer Report",
          ]}
          checked={[]}
          onToggle={() => {}}
        />
      </FilterAccordion>
      <FilterAccordion label="Status">
        <CheckList
          options={["New", "Acknowledged", "Under Investigation", "Resolved"]}
          checked={[]}
          onToggle={() => {}}
        />
      </FilterAccordion>
      <FilterAccordion label="Assigned To">
        <CheckList
          options={[
            "John Bello",
            "Mary Akinyemi",
            "Ibrahim Yusuf",
            "Samuel Odey",
            "Grace Nwosu",
            "Unassigned",
          ]}
          checked={[]}
          onToggle={() => {}}
        />
      </FilterAccordion>
      <FilterAccordion label="Entity Type">
        <CheckList
          options={["Vessel", "Company", "Port", "Cargo", "Person"]}
          checked={[]}
          onToggle={() => {}}
        />
      </FilterAccordion>
      <FilterAccordion label="Port / Location">
        <CheckList
          options={["Apapa", "Tin Can Island", "Onne", "Port Harcourt", "Calabar"]}
          checked={[]}
          onToggle={() => {}}
        />
      </FilterAccordion>
      <FilterAccordion label="Date Range">
        <div className="text-[11px] text-foreground/80">May 20 – May 27, 2026</div>
      </FilterAccordion>
      <button className="mt-3 w-full rounded-md bg-[color:var(--color-blue)] py-1.5 text-[12px] font-semibold text-white hover:bg-[color:var(--color-blue)]/90">
        Apply Filters
      </button>
      <div className="mt-4">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
          Saved Views
        </div>
        <ul className="space-y-1">
          {["My Alerts", "Revenue Alerts", "High Risk Vessels", "Unassigned Alerts"].map((v) => (
            <li key={v}>
              <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11.5px] text-foreground/80 hover:bg-surface-2/60">
                <Bookmark className="h-3 w-3 text-slate" />
                {v}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function FilterAccordion({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line/40 py-2 first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-[11.5px] font-medium text-foreground/90"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn("h-3 w-3 text-slate transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function CheckList({
  options,
  checked,
  onToggle,
}: {
  options: string[];
  checked: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {options.map((o) => (
        <li key={o} className="flex items-center gap-2 text-[11.5px] text-foreground/80">
          <input
            type="checkbox"
            checked={checked.includes(o)}
            onChange={() => onToggle(o)}
            className="h-3 w-3 accent-[color:var(--color-blue)]"
          />
          {o}
        </li>
      ))}
    </ul>
  );
}

/* ------------- Alert Queue ------------- */
function AlertQueue({
  alerts,
  total,
  selectedId,
  onSelect,
  live,
}: {
  alerts: ExtAlert[];
  total: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  live: ReturnType<typeof useAlertsRealtime>;
}) {
  const [page, setPage] = useState(1);
  const per = 6;
  const pages = Math.max(1, Math.ceil(total / per));
  const shown = alerts.slice(0, per);

  return (
    <div className="flex h-full flex-col rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          <span>
            Alert Queue <span className="text-foreground">({total})</span>
          </span>
          <PanelLive lastEvent={live.lastEvent} status={live.status} kinds={["alert"]} />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate">
          Select All <input type="checkbox" className="h-3 w-3 accent-[color:var(--color-blue)]" />
        </label>
      </header>
      <ul className="flex-1 divide-y divide-line/40">
        {shown.map((a) => (
          <QueueRow
            key={a.id}
            alert={a}
            selected={a.id === selectedId}
            onClick={() => onSelect(a.id)}
            fresh={live.wasRecentlyUpdated(a.alertId)}
          />
        ))}
        {shown.length === 0 && (
          <li className="p-8 text-center text-[12px] text-slate">
            No alerts match the current filters.
          </li>
        )}
      </ul>
      <footer className="flex items-center justify-between border-t border-line/60 px-3 py-2 text-[11px] text-slate">
        <span>
          Showing 1 – {shown.length} of {total} alerts
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            className="rounded p-1 hover:bg-surface-2/60"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={cn(
                "min-w-[22px] rounded px-1.5 py-0.5 text-[11px]",
                page === n
                  ? "bg-[color:var(--color-blue)]/20 text-[color:var(--color-blue)]"
                  : "hover:bg-surface-2/60",
              )}
            >
              {n}
            </button>
          ))}
          <span>…</span>
          <button
            onClick={() => setPage(pages)}
            className="min-w-[22px] rounded px-1.5 py-0.5 hover:bg-surface-2/60"
          >
            {pages}
          </button>
          <button
            onClick={() => setPage(Math.min(pages, page + 1))}
            className="rounded p-1 hover:bg-surface-2/60"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function severityTone(sev: string) {
  return sev === "high" ? "risk" : sev === "medium" ? "warn" : sev === "low" ? "ok" : "info";
}
function severityLabel(sev: string) {
  return sev === "high" ? "CRITICAL" : sev.toUpperCase();
}

function QueueRow({
  alert,
  selected,
  onClick,
  fresh,
}: {
  alert: ExtAlert;
  selected: boolean;
  onClick: () => void;
  fresh?: boolean;
}) {
  const tone = severityTone(alert.severity);
  const toneCls =
    tone === "risk"
      ? "border-[color:var(--color-red)]"
      : tone === "warn"
        ? "border-[color:var(--color-amber)]"
        : tone === "ok"
          ? "border-[color:var(--color-green)]"
          : "border-[color:var(--color-blue)]";
  return (
    <li
      onClick={onClick}
      className={cn(
        "relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors",
        selected ? "bg-[color:var(--color-blue)]/10" : "hover:bg-surface-2/40",
        selected && "border-l-2 border-l-[color:var(--color-blue)]",
        fresh && "bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/40 animate-in fade-in",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border bg-surface-2/50",
          toneCls,
        )}
      >
        <IconForType type={alert.type} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-semibold text-foreground">
            {alert.title}
          </span>
          <SeverityBadge sev={alert.severity} />
          {fresh && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-emerald-300">
              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
              Updated just now
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate">
          {alert.vesselId ? vesselById(alert.vesselId)?.name : alert.type}
          {alert.imo && <> · IMO {alert.imo}</>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate">Confidence</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <div className="h-1 w-16 overflow-hidden rounded bg-surface-2/60">
            <div
              className="h-full rounded bg-[color:var(--color-green)]"
              style={{ width: `${confPct(alert.confidence)}%` }}
            />
          </div>
          <span className="text-[10.5px] text-foreground">{confPct(alert.confidence)}%</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate">Status</div>
        <div className="mt-0.5">
          <StatusPill status={alert.status} />
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate">Assigned To</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground">
          <Avatar name={alert.assignedTo} />
          <span className="truncate">{alert.assignedTo}</span>
        </div>
      </div>
    </li>
  );
}

function confPct(c: ConfidenceTier) {
  return c === "verified" ? 95 : c === "observed" ? 87 : c === "inferred" ? 76 : 62;
}

function SeverityBadge({ sev }: { sev: string }) {
  const tone = severityTone(sev);
  const cls =
    tone === "risk"
      ? "text-[color:var(--color-red)] bg-[color:var(--color-red)]/10 border-[color:var(--color-red)]/40"
      : tone === "warn"
        ? "text-[color:var(--color-amber)] bg-[color:var(--color-amber)]/10 border-[color:var(--color-amber)]/40"
        : tone === "ok"
          ? "text-[color:var(--color-green)] bg-[color:var(--color-green)]/10 border-[color:var(--color-green)]/40"
          : "text-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10 border-[color:var(--color-blue)]/40";
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]",
        cls,
      )}
    >
      {severityLabel(sev)}
    </span>
  );
}

function StatusPill({ status }: { status: AlertStatus }) {
  const map = {
    NEW: "text-[color:var(--color-red)] bg-[color:var(--color-red)]/10 border-[color:var(--color-red)]/40",
    ACK: "text-[color:var(--color-amber)] bg-[color:var(--color-amber)]/10 border-[color:var(--color-amber)]/40",
    RESOLVED:
      "text-[color:var(--color-green)] bg-[color:var(--color-green)]/10 border-[color:var(--color-green)]/40",
  } as const;
  const label = status === "ACK" ? "ACKNOWLEDGED" : status;
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]",
        map[status],
      )}
    >
      {label}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-blue)]/20 text-[9px] font-bold text-[color:var(--color-blue)]">
      {initials}
    </span>
  );
}

function IconForType({ type }: { type: string }) {
  if (type.includes("AIS"))
    return <ShieldAlert className="h-4 w-4 text-[color:var(--color-red)]" />;
  if (type.includes("Duplicate") || type.includes("Manifest"))
    return <FileText className="h-4 w-4 text-[color:var(--color-amber)]" />;
  if (type.includes("Revenue")) return <Zap className="h-4 w-4 text-[color:var(--color-amber)]" />;
  if (type.includes("Watchlist") || type.includes("Sanctions"))
    return <ShieldAlert className="h-4 w-4 text-[color:var(--color-red)]" />;
  if (type.includes("Dangerous"))
    return <AlertTriangle className="h-4 w-4 text-[color:var(--color-amber)]" />;
  if (type.includes("Ownership"))
    return <UserPlus className="h-4 w-4 text-[color:var(--color-amber)]" />;
  return <AlertTriangle className="h-4 w-4 text-[color:var(--color-red)]" />;
}

/* ------------- Alert Details + Mini Map ------------- */
function AlertDetails({
  alert,
  onStatus,
  live,
}: {
  alert: ExtAlert;
  onStatus: (id: string, s: AlertStatus) => void;
  live: ReturnType<typeof useAlertsRealtime>;
}) {
  const vessel = alert.vesselId ? vesselById(alert.vesselId) : undefined;
  const fresh = live.wasRecentlyUpdated(alert.alertId);
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-lg border border-line/60 bg-surface-1/70 transition-shadow",
        fresh && "ring-1 ring-emerald-400/50 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]",
      )}
    >
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
            Alert Details
          </span>
          <SeverityBadge sev={alert.severity} />
          <PanelLive lastEvent={live.lastEvent} status={live.status} kinds={["alert"]} />
          {fresh && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-emerald-300">
              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
              Updated just now
            </span>
          )}
        </div>
        <span className="text-[10.5px] text-slate">Alert ID: {alert.alertId}</span>
      </header>
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold text-foreground">{alert.title}</div>
            <div className="mt-0.5 text-[11.5px] text-slate">
              {vessel?.name}
              {vessel && <> · IMO {vessel.imo}</>}
            </div>
          </div>
          <StatusPill status={alert.status} />
        </div>

        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate">
            Summary
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/85">
            {alert.detail} This pattern is consistent with previous incidents linked to dark
            activities.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-y-1.5 text-[11px]">
          <DetailRow label="Source" value="AIS Network" />
          <DetailRow label="First Detected" value={fmtDT(alert.firstDetected)} />
          <DetailRow label="Last Detected" value={fmtDT(alert.timeISO)} />
          <DetailRow label="Location" value="3.3942° N, 6.4551° E" />
          <DetailRow label="Risk Score" value={<RiskBar score={alert.riskScore} />} />
          <DetailRow label="Potential Impact" value="Revenue Loss / Security Risk" />
          <DetailRow
            label="Linked Voyage"
            value={
              <span className="text-[color:var(--color-blue)]">
                LA{620260000 + Math.floor(alert.riskScore * 1000)}
              </span>
            }
          />
          <DetailRow label="Linked Port" value="Apapa Port, Lagos" />
          <DetailRow label="Linked Company" value="Global Chartering Inc." />
          <DetailRow
            label="Linked Investigation"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[color:var(--color-blue)]">
                  {alert.investigationId ?? "INV-2026-00431"}
                </span>
                <span className="rounded border border-[color:var(--color-green)]/40 bg-[color:var(--color-green)]/10 px-1 py-0.5 text-[9px] font-bold text-[color:var(--color-green)]">
                  Open
                </span>
              </span>
            }
          />
        </dl>

        <MiniMap />

        <div className="flex flex-wrap gap-2 border-t border-line/60 pt-3">
          {alert.status === "NEW" && (
            <button
              onClick={() => onStatus(alert.id, "ACK")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-blue)]/50 bg-[color:var(--color-blue)]/10 px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--color-blue)] hover:bg-[color:var(--color-blue)]/20"
            >
              <Bell className="h-3 w-3" /> Acknowledge
            </button>
          )}
          {alert.status !== "RESOLVED" && (
            <button
              onClick={() => onStatus(alert.id, "RESOLVED")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-green)]/50 bg-[color:var(--color-green)]/10 px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--color-green)] hover:bg-[color:var(--color-green)]/20"
            >
              <CheckCircle2 className="h-3 w-3" /> Resolve
            </button>
          )}
          <button className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/50 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-surface-2/70">
            <FolderOpen className="h-3 w-3" /> Open Investigation
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/50 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-surface-2/70">
            <UserPlus className="h-3 w-3" /> Assign
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/50 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-surface-2/70">
            <ArrowUpRight className="h-3 w-3" /> Escalate
          </button>
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </>
  );
}

function RiskBar({ score }: { score: number }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="h-1 w-20 overflow-hidden rounded bg-surface-2/60">
        <div
          className="h-full rounded bg-[color:var(--color-red)]"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[11px]">{score}/100</span>
    </div>
  );
}

function fmtDT(iso: string) {
  const d = new Date(iso);
  const wat = new Date(d.getTime());
  return `${wat.toISOString().slice(0, 10).replace(/-/g, "-")} ${String(wat.getUTCHours()).padStart(2, "0")}:${String(wat.getUTCMinutes()).padStart(2, "0")} WAT`;
}

function MiniMap() {
  return (
    <div className="relative h-32 overflow-hidden rounded-md border border-line/60 bg-[#0a1628]">
      <svg viewBox="0 0 300 128" className="h-full w-full">
        <defs>
          <radialGradient id="water" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0f2d4f" />
            <stop offset="100%" stopColor="#0a1628" />
          </radialGradient>
        </defs>
        <rect width="300" height="128" fill="url(#water)" />
        {/* coastline */}
        <path
          d="M0,80 Q60,60 120,74 T240,68 T300,80 L300,128 L0,128 Z"
          fill="#1a3556"
          opacity="0.6"
        />
        {/* route */}
        <path
          d="M40,110 Q120,70 200,50"
          stroke="#ef4444"
          strokeWidth="1.2"
          strokeDasharray="3 2"
          fill="none"
          opacity="0.8"
        />
        {/* port */}
        <circle cx="200" cy="50" r="3" fill="#22c55e" />
        <text x="208" y="52" fill="#94a3b8" fontSize="8">
          Apapa Anchorage
        </text>
        {/* vessel */}
        <circle cx="120" cy="80" r="4" fill="#ef4444">
          <animate attributeName="r" values="4;6;4" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button className="rounded bg-surface-1/80 p-1 text-slate hover:text-foreground">+</button>
        <button className="rounded bg-surface-1/80 p-1 text-slate hover:text-foreground">−</button>
      </div>
    </div>
  );
}

/* ------------- Copilot + AI Insights ------------- */
function CopilotPanel({ alert }: { alert: ExtAlert }) {
  return (
    <section className="rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-blue)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
            Seaphore Copilot
          </span>
          <span className="rounded bg-[color:var(--color-blue)]/20 px-1 py-0.5 text-[8.5px] font-bold text-[color:var(--color-blue)]">
            BETA
          </span>
        </div>
        <ChevronDown className="h-3 w-3 text-slate" />
      </header>
      <div className="p-3">
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2/40 px-2 py-1.5">
          <input
            placeholder="Ask anything about this alert..."
            className="w-full bg-transparent text-[11.5px] outline-none placeholder:text-slate/70"
          />
          <button className="rounded bg-[color:var(--color-blue)] p-1 text-white">
            <Send className="h-3 w-3" />
          </button>
        </div>
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
          AI Insights
        </div>
        <ul className="space-y-2 text-[11px]">
          <InsightRow
            tone="risk"
            text={`Similar AIS blackout detected 3 times in the last 30 days for this vessel.`}
            tag="HIGH"
          />
          <InsightRow
            tone="warn"
            text="Vessel has changed ownership twice in the last 60 days."
            tag="MEDIUM"
          />
          <InsightRow tone="info" text="Last port of call was Tincan Island Port." tag="INFO" />
          <InsightRow
            tone="risk"
            text={`Revenue impact estimate: ₦${(alert.riskScore * 0.46).toFixed(1)}M.`}
            tag="HIGH"
          />
          <InsightRow tone="ok" text="Recommend immediate inspection upon arrival." tag="ACTION" />
        </ul>
        <button className="mt-3 w-full text-center text-[11px] text-[color:var(--color-blue)] hover:underline">
          View full analysis →
        </button>
      </div>
    </section>
  );
}

function InsightRow({
  tone,
  text,
  tag,
}: {
  tone: "risk" | "warn" | "info" | "ok";
  text: string;
  tag: string;
}) {
  const dot =
    tone === "risk"
      ? "bg-[color:var(--color-red)]"
      : tone === "warn"
        ? "bg-[color:var(--color-amber)]"
        : tone === "info"
          ? "bg-[color:var(--color-blue)]"
          : "bg-[color:var(--color-green)]";
  const tagCls =
    tone === "risk"
      ? "text-[color:var(--color-red)] bg-[color:var(--color-red)]/10"
      : tone === "warn"
        ? "text-[color:var(--color-amber)] bg-[color:var(--color-amber)]/10"
        : tone === "info"
          ? "text-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10"
          : "text-[color:var(--color-green)] bg-[color:var(--color-green)]/10";
  return (
    <li className="flex items-start gap-2">
      <span className={cn("mt-1 h-2 w-2 rounded-full", dot)} />
      <span className="flex-1 text-foreground/85">{text}</span>
      <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-bold", tagCls)}>{tag}</span>
    </li>
  );
}

/* ------------- Recommended Actions ------------- */
function RecommendedActionsPanel({
  alert,
  onStatus,
}: {
  alert: ExtAlert;
  onStatus: (id: string, s: AlertStatus) => void;
}) {
  const actions: {
    label: string;
    icon: React.ReactNode;
    tone: "risk" | "warn" | "info" | "muted";
    badge: string;
    onClick?: () => void;
  }[] = [
    {
      label: "Open Investigation",
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      tone: "risk",
      badge: "HIGH",
    },
    {
      label: "Assign to Officer",
      icon: <UserPlus className="h-3.5 w-3.5" />,
      tone: "risk",
      badge: "HIGH",
    },
    {
      label: "Request Additional Evidence",
      icon: <FileText className="h-3.5 w-3.5" />,
      tone: "warn",
      badge: "MEDIUM",
    },
    {
      label: "Notify Customs",
      icon: <Bell className="h-3.5 w-3.5" />,
      tone: "info",
      badge: "INFO",
    },
    {
      label: "Mark as False Positive",
      icon: <XCircle className="h-3.5 w-3.5" />,
      tone: "muted",
      badge: "",
      onClick: () => onStatus(alert.id, "RESOLVED"),
    },
  ];
  return (
    <section className="rounded-lg border border-line/60 bg-surface-1/70">
      <header className="border-b border-line/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
        Recommended Actions
      </header>
      <ul className="divide-y divide-line/30">
        {actions.map((a) => {
          const iconCls =
            a.tone === "risk"
              ? "text-[color:var(--color-red)]"
              : a.tone === "warn"
                ? "text-[color:var(--color-amber)]"
                : a.tone === "info"
                  ? "text-[color:var(--color-blue)]"
                  : "text-slate";
          const badgeCls =
            a.tone === "risk"
              ? "text-[color:var(--color-red)] bg-[color:var(--color-red)]/10"
              : a.tone === "warn"
                ? "text-[color:var(--color-amber)] bg-[color:var(--color-amber)]/10"
                : a.tone === "info"
                  ? "text-[color:var(--color-blue)] bg-[color:var(--color-blue)]/10"
                  : "";
          return (
            <li key={a.label}>
              <button
                onClick={a.onClick}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] text-foreground hover:bg-surface-2/40"
              >
                <span className={iconCls}>{a.icon}</span>
                <span className="flex-1">{a.label}</span>
                {a.badge && (
                  <span className={cn("rounded px-1 py-0.5 text-[9px] font-bold", badgeCls)}>
                    {a.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------- Live Timeline ------------- */
function LiveTimeline({
  alerts,
  selectedId,
  onSelect,
  live,
}: {
  alerts: ExtAlert[];
  selectedId?: string;
  onSelect: (id: string) => void;
  live: ReturnType<typeof useAlertsRealtime>;
}) {
  const items = alerts.slice(0, 6);
  return (
    <section className="rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          Live Alert Timeline
        </span>
        <PanelLive lastEvent={live.lastEvent} status={live.status} kinds={["signal", "alert"]} />
      </header>
      <ul className="relative px-3 py-3">
        <div className="absolute left-[52px] top-3 bottom-3 w-px bg-line/40" />
        {items.map((a) => {
          const tone = severityTone(a.severity);
          const dot =
            tone === "risk"
              ? "bg-[color:var(--color-red)]"
              : tone === "warn"
                ? "bg-[color:var(--color-amber)]"
                : tone === "ok"
                  ? "bg-[color:var(--color-green)]"
                  : "bg-[color:var(--color-blue)]";
          return (
            <li
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={cn(
                "relative mb-2 grid cursor-pointer grid-cols-[32px_10px_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1",
                a.id === selectedId ? "bg-[color:var(--color-blue)]/10" : "hover:bg-surface-2/40",
              )}
            >
              <span className="text-[10.5px] tabular-nums text-slate">
                {new Date(a.timeISO).toISOString().slice(11, 16)}
              </span>
              <span className={cn("z-10 h-2 w-2 rounded-full ring-2 ring-surface-1", dot)} />
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium text-foreground">
                  {a.title.split(" ").slice(0, 4).join(" ")}
                </div>
                <div className="truncate text-[10px] text-slate">
                  {a.vesselId ? vesselById(a.vesselId)?.name : ""}
                </div>
              </div>
              <SeverityBadge sev={a.severity} />
            </li>
          );
        })}
      </ul>
      <footer className="border-t border-line/60 px-3 py-2">
        <button className="w-full text-center text-[11px] text-[color:var(--color-blue)] hover:underline">
          View full timeline →
        </button>
      </footer>
    </section>
  );
}

/* ------------- Correlation Graph ------------- */
function CorrelationGraph({
  alerts,
  selectedId,
  onSelect,
  live,
}: {
  alerts: ExtAlert[];
  selectedId?: string;
  onSelect: (id: string) => void;
  live: ReturnType<typeof useAlertsRealtime>;
}) {
  const nodes = alerts.slice(0, 6);
  // Radial layout around a central node.
  const center = { x: 150, y: 110 };
  const radius = 80;
  const positions = nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return {
      id: n.id,
      alert: n,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
  const centerAlert = nodes.find((n) => n.id === selectedId) ?? nodes[0];
  return (
    <section className="flex h-full flex-col rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
            Alert Correlation Graph
          </span>
          <PanelLive
            lastEvent={live.lastEvent}
            status={live.status}
            kinds={["alert", "investigation"]}
          />
        </div>
        <label className="flex items-center gap-1.5 text-[10.5px] text-slate">
          Show Legend{" "}
          <input
            type="checkbox"
            defaultChecked
            className="h-3 w-3 accent-[color:var(--color-blue)]"
          />
        </label>
      </header>
      <div className="flex-1 p-2">
        <svg viewBox="0 0 300 220" className="h-full w-full">
          {positions.map((p) => (
            <line
              key={`e-${p.id}`}
              x1={center.x}
              y1={center.y}
              x2={p.x}
              y2={p.y}
              stroke={p.id === selectedId ? "#3b82f6" : "#334155"}
              strokeWidth={p.id === selectedId ? 1.5 : 1}
              strokeDasharray={p.id === selectedId ? "" : "3 2"}
            />
          ))}
          {positions.map((p) => {
            const tone = severityTone(p.alert.severity);
            const fill =
              tone === "risk"
                ? "#7f1d1d"
                : tone === "warn"
                  ? "#78350f"
                  : tone === "ok"
                    ? "#14532d"
                    : "#1e3a8a";
            return (
              <g key={p.id} className="cursor-pointer" onClick={() => onSelect(p.id)}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="14"
                  fill={fill}
                  stroke={p.id === selectedId ? "#60a5fa" : "#334155"}
                  strokeWidth="1.5"
                />
                <text x={p.x} y={p.y - 20} textAnchor="middle" fill="#e2e8f0" fontSize="8">
                  {p.alert.type.split(" ").slice(0, 2).join(" ")}
                </text>
                <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#e2e8f0" fontSize="7">
                  {new Date(p.alert.timeISO).toISOString().slice(11, 16)}
                </text>
              </g>
            );
          })}
          {centerAlert && (
            <g>
              <circle
                cx={center.x}
                cy={center.y}
                r="24"
                fill="#450a0a"
                stroke="#ef4444"
                strokeWidth="2"
              />
              <text
                x={center.x}
                y={center.y - 2}
                textAnchor="middle"
                fill="#fecaca"
                fontSize="8"
                fontWeight="bold"
              >
                {centerAlert.type.split(" ").slice(0, 2).join(" ")}
              </text>
              <text x={center.x} y={center.y + 9} textAnchor="middle" fill="#fca5a5" fontSize="7">
                {new Date(centerAlert.timeISO).toISOString().slice(11, 16)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}

/* ------------- Severity Donut ------------- */
function SeverityDonut() {
  const data = [
    { name: "Critical", value: 218, color: "#ef4444" },
    { name: "High", value: 542, color: "#f59e0b" },
    { name: "Medium", value: 336, color: "#3b82f6" },
    { name: "Low", value: 102, color: "#22c55e" },
    { name: "Info", value: 50, color: "#8b5cf6" },
  ];
  const total = data.reduce((a, b) => a + b.value, 0);
  const trend = Array.from({ length: 8 }, (_, i) => ({ v: 500 + Math.sin(i) * 200 + i * 20 }));
  return (
    <section className="rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          Alerts by Severity
        </span>
        <span className="text-[10.5px] text-slate">Last 30 days</span>
      </header>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="relative h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[15px] font-bold text-foreground">{total.toLocaleString()}</div>
            <div className="text-[9px] uppercase tracking-[0.06em] text-slate">Total Alerts</div>
          </div>
        </div>
        <ul className="space-y-1.5 text-[10.5px]">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-foreground/85">{d.name}</span>
              </span>
              <span className="text-slate">
                {d.value} ({Math.round((d.value / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-3 pb-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate">
          <span>Trend</span>
          <span>100%</span>
        </div>
        <div className="h-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="#3b82f6"
                strokeWidth={1.5}
                fill="url(#trendGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between text-[9px] text-slate">
          <span>May 20</span>
          <span>May 23</span>
          <span>May 26</span>
          <span>May 27</span>
        </div>
      </div>
    </section>
  );
}

/* ------------- Officer Performance ------------- */
function OfficerPerformance() {
  return (
    <section className="rounded-lg border border-line/60 bg-surface-1/70">
      <header className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate">
          Officer Performance
        </span>
        <span className="text-[10.5px] text-slate">This Month</span>
      </header>
      <div className="p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_60px_50px_60px] gap-2 border-b border-line/40 pb-1 text-[9.5px] uppercase tracking-[0.06em] text-slate">
          <span>Officer</span>
          <span>Response</span>
          <span>Handled</span>
          <span>Accuracy</span>
        </div>
        <ul className="mt-1 divide-y divide-line/30">
          {OFFICERS.map((o) => (
            <li
              key={o.name}
              className="grid grid-cols-[minmax(0,1fr)_60px_50px_60px] items-center gap-2 py-1.5 text-[11px]"
            >
              <span className="flex items-center gap-1.5 truncate text-foreground">
                <Avatar name={o.name} /> <span className="truncate">{o.name}</span>
              </span>
              <span className="tabular-nums text-foreground/85">{o.responseTime}</span>
              <span className="tabular-nums text-foreground/85">{o.handled}</span>
              <span className="flex items-center gap-1">
                <div className="h-1 flex-1 overflow-hidden rounded bg-surface-2/60">
                  <div
                    className="h-full rounded bg-[color:var(--color-green)]"
                    style={{ width: `${o.accuracy}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-foreground/85">
                  {o.accuracy}%
                </span>
              </span>
            </li>
          ))}
        </ul>
        <button className="mt-2 w-full text-center text-[11px] text-[color:var(--color-blue)] hover:underline">
          View full performance →
        </button>
      </div>
    </section>
  );
}
