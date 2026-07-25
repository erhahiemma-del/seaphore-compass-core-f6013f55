/**
 * /investigations — Maritime Investigation Workspace (MIW) Dashboard.
 *
 * Sprint 1H · Landing 1. Officer-facing dashboard aggregating all persistent
 * investigations from the workspace store. KPI cards + filterable table.
 * Every number wears a confidence chip via evidenceCompleteness/confidenceTier.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Clock,
  Coins,
  Compass,
  FolderOpen,
  Gauge,
  Plus,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  INVESTIGATION_STAGES,
  useWorkspaceStore,
  type InvestigationStage,
  type InvestigationWorkspace,
} from "@/stores/workspace.store";

export const Route = createFileRoute("/investigations")({
  head: () => ({
    meta: [
      { title: "Investigation Dashboard · Seaphore" },
      {
        name: "description",
        content:
          "Maritime Investigation Workspace — every case, every stage, every officer. Explainable confidence, evidence coverage, and revenue at risk.",
      },
      { property: "og:title", content: "Investigation Dashboard · Seaphore" },
      {
        property: "og:description",
        content:
          "Operational command view of all maritime investigations across the intelligence lifecycle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestigationsDashboard,
});

const STAGE_ORDER: InvestigationStage[] = INVESTIGATION_STAGES;

const STAGE_LABEL: Record<InvestigationStage, string> = {
  INTAKE: "Intake",
  EVIDENCE: "Evidence",
  ANALYSIS: "Analysis",
  DECISION: "Decision",
  REPORT: "Report",
  CLOSED: "Closed",
};

const PRIORITY_VARIANT: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/40",
  HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  MEDIUM: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
  LOW: "bg-slate-500/15 text-slate-400 border-slate-500/40",
};

const CONFIDENCE_VARIANT: Record<string, string> = {
  HIGH: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  MEDIUM: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
  LOW: "bg-red-500/15 text-red-400 border-red-500/40",
};

function isOverdue(inv: InvestigationWorkspace): boolean {
  if (!inv.dueAt || inv.status === "CLOSED") return false;
  return new Date(inv.dueAt).getTime() < Date.now();
}

function usd(n: number | undefined): string {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warn"
        ? "text-yellow-400"
        : tone === "success"
          ? "text-emerald-400"
          : "text-[color:var(--color-teal)]";
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="type-label text-muted-foreground">{label}</div>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
        {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function InvestigationsDashboard() {
  const investigations = useWorkspaceStore((s) => s.investigations);
  const createInvestigation = useWorkspaceStore((s) => s.createInvestigation);
  const navigate = useNavigate();

  const [stageFilter, setStageFilter] = useState<"ALL" | InvestigationStage>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");

  const all = useMemo(() => Object.values(investigations), [investigations]);

  const kpis = useMemo(() => {
    const active = all.filter((i) => i.status !== "CLOSED");
    const byStage: Record<InvestigationStage, number> = {
      INTAKE: 0,
      EVIDENCE: 0,
      ANALYSIS: 0,
      DECISION: 0,
      REPORT: 0,
      CLOSED: 0,
    };
    for (const i of all) byStage[i.stage ?? "INTAKE"] = (byStage[i.stage ?? "INTAKE"] ?? 0) + 1;

    const critical = active.filter((i) => i.priority === "CRITICAL").length;
    const high = active.filter((i) => i.priority === "HIGH").length;
    const overdue = active.filter(isOverdue).length;
    const highConfidence = active.filter((i) => i.confidenceTier === "HIGH").length;
    const lowConfidence = active.filter((i) => i.confidenceTier === "LOW").length;
    const avgCompleteness = active.length
      ? Math.round(active.reduce((s, i) => s + i.evidenceCompleteness, 0) / active.length)
      : 0;
    const revenueAtRisk = active.reduce(
      (s, i) => s + (i.estimatedRevenueImpactUsd ?? 0),
      0,
    );
    const officers = new Set<string>();
    for (const i of all) {
      officers.add(i.officer);
      for (const a of i.assignees ?? []) officers.add(a);
    }
    const openTasks = all.reduce(
      (s, i) => s + i.tasks.filter((t) => t.status !== "COMPLETED").length,
      0,
    );
    const pendingEvidence = active.reduce(
      (s, i) => s + i.evidence.filter((e) => e.category === "PENDING").length,
      0,
    );
    const conflicts = active.reduce(
      (s, i) => s + i.evidence.filter((e) => e.category === "CONFLICTING").length,
      0,
    );

    return {
      total: all.length,
      active: active.length,
      byStage,
      critical,
      high,
      overdue,
      highConfidence,
      lowConfidence,
      avgCompleteness,
      revenueAtRisk,
      officers: officers.size,
      openTasks,
      pendingEvidence,
      conflicts,
    };
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((i) => (stageFilter === "ALL" ? true : (i.stage ?? "INTAKE") === stageFilter))
      .filter((i) => (priorityFilter === "ALL" ? true : i.priority === priorityFilter))
      .filter((i) =>
        needle
          ? [i.title, i.subjectName, i.officer, i.caseType, i.region]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(needle))
          : true,
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [all, q, stageFilter, priorityFilter]);

  const handleNew = () => {
    const id = createInvestigation({
      title: `New investigation · ${new Date().toLocaleString()}`,
      priority: "MEDIUM",
      caseType: "GENERIC",
    });
    navigate({ to: "/workspace/$id", params: { id } });
  };

  return (
    <AppShell
      title="Investigation Dashboard"
      subtitle="Maritime Investigation Workspace · every case, every stage"
    >
      <div className="mb-3 flex justify-end">
        <Button onClick={handleNew} size="sm">
          <Plus className="mr-2 h-4 w-4" /> New investigation
        </Button>
      </div>
      {/* KPI row 1 — volume + risk */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          label="Active investigations"
          value={kpis.active}
          hint={`${kpis.total} total · ${kpis.byStage.CLOSED} closed`}
          icon={FolderOpen}
        />
        <KpiCard
          label="Critical + high priority"
          value={kpis.critical + kpis.high}
          hint={`${kpis.critical} critical · ${kpis.high} high`}
          icon={ShieldAlert}
          tone={kpis.critical > 0 ? "danger" : "warn"}
        />
        <KpiCard
          label="Overdue"
          value={kpis.overdue}
          hint={kpis.overdue ? "Past due date" : "All on schedule"}
          icon={Clock}
          tone={kpis.overdue > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Revenue at risk"
          value={usd(kpis.revenueAtRisk)}
          hint="Sum of estimated impact across active cases"
          icon={Coins}
          tone={kpis.revenueAtRisk > 0 ? "warn" : "default"}
        />
      </div>

      {/* KPI row 2 — intelligence health */}
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <KpiCard
          label="High-confidence cases"
          value={kpis.highConfidence}
          hint={`${kpis.lowConfidence} still low confidence`}
          icon={Gauge}
          tone="success"
        />
        <KpiCard
          label="Avg. evidence coverage"
          value={`${kpis.avgCompleteness}%`}
          hint="Weighted across active cases"
          icon={Activity}
        />
        <KpiCard
          label="Pending evidence"
          value={kpis.pendingEvidence}
          hint={`${kpis.conflicts} conflicting items`}
          icon={AlertTriangle}
          tone={kpis.conflicts > 0 ? "warn" : "default"}
        />
        <KpiCard
          label="Open tasks"
          value={kpis.openTasks}
          hint={`${kpis.officers} officer${kpis.officers === 1 ? "" : "s"} engaged`}
          icon={ClipboardList}
        />
      </div>

      {/* Stage lane */}
      <Card className="mt-4 border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <span className="inline-flex items-center gap-2">
              <Compass className="h-4 w-4 text-[color:var(--color-teal)]" /> Lifecycle
              distribution
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {STAGE_ORDER.map((stage) => {
              const n = kpis.byStage[stage] ?? 0;
              return (
                <button
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  className={`rounded-md border p-3 text-left motion-fast hover:border-[color:var(--color-teal)]/60 ${
                    stageFilter === stage
                      ? "border-[color:var(--color-teal)] bg-[color:var(--color-teal)]/10"
                      : "border-border/60"
                  }`}
                >
                  <div className="type-label text-muted-foreground">{STAGE_LABEL[stage]}</div>
                  <div className="mt-1 text-xl font-bold">{n}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters + Table */}
      <Card className="mt-4 border-border/60">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-[color:var(--color-teal)]" /> Investigations
                <Badge variant="outline" className="ml-1 text-[10px]">
                  {filtered.length}
                </Badge>
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search title, subject, officer…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 w-56"
              />
              <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as "ALL" | InvestigationStage)}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All stages</SelectItem>
                  {STAGE_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All priority</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-8 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No investigations match these filters</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Open Copilot to run a query, or create a case manually.
              </div>
              <Button onClick={handleNew} size="sm" className="mt-3">
                <Plus className="mr-2 h-4 w-4" /> New investigation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Officer</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i) => {
                    const stage = i.stage ?? "INTAKE";
                    const overdue = isOverdue(i);
                    return (
                      <TableRow key={i.id} className="cursor-pointer">
                        <TableCell className="max-w-[280px]">
                          <Link
                            to="/workspace/$id"
                            params={{ id: i.id }}
                            className="font-medium hover:text-[color:var(--color-teal)]"
                          >
                            {i.title}
                          </Link>
                          <div className="flex gap-1 pt-0.5 text-[10px] text-muted-foreground">
                            {i.caseType ? <span>{i.caseType}</span> : null}
                            {i.region ? <span>· {i.region}</span> : null}
                            {overdue ? <span className="text-red-400">· Overdue</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {i.subjectName ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {STAGE_LABEL[stage]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase ${PRIORITY_VARIANT[i.priority] ?? ""}`}
                          >
                            {i.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${CONFIDENCE_VARIANT[i.confidenceTier] ?? ""}`}
                          >
                            {i.confidenceTier} · {i.confidencePct}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{i.evidenceCompleteness}%</TableCell>
                        <TableCell className="text-xs">{i.officer}</TableCell>
                        <TableCell className="text-xs">{usd(i.estimatedRevenueImpactUsd)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {relative(i.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
