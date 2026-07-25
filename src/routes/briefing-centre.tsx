import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspaceStore } from "@/stores/workspace.store";
import { useMissionStore } from "@/services/mission";
import { useUipStore } from "@/stores/uip.store";
import { intelligenceOrchestrator } from "@/services/intelligence-orchestrator";
import { toast } from "sonner";
import {
  buildReport,
  parseReportRequest,
  exportReport,
  downloadBlob,
  REPORT_TYPES,
  REPORT_TYPE_LABEL,
  REPORT_PERIODS,
  REPORT_PERIOD_LABEL,
  type ReportType,
  type ReportPeriod,
  type ExportFormat,
  type ReportPackage,
} from "@/services/mibc";
import { FileText, FileDown, Sparkles } from "lucide-react";
import { SchedulesPanel } from "@/components/briefing/SchedulesPanel";
import { JobHistoryPanel } from "@/components/briefing/JobHistoryPanel";
import { useReportJobDrainer } from "@/lib/mibc/job-drainer";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/briefing-centre")({
  head: () => ({
    meta: [
      { title: "Maritime Intelligence Briefing Centre · Seaphore" },
      {
        name: "description",
        content:
          "Enterprise reporting engine. Every report is assembled from Canonical Unified Intelligence Packages resolved via the Intelligence Orchestrator.",
      },
      { property: "og:title", content: "Maritime Intelligence Briefing Centre" },
      {
        property: "og:description",
        content:
          "Executive briefings built exclusively from Canonical UIP snapshots — Live or Investigation-based.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BriefingCentre,
});

type SourceMode = "INVESTIGATION" | "LIVE_UIP";

function BriefingCentre() {
  useReportJobDrainer(true);
  const { session } = useAuth();
  const officerId = session?.user?.id;
  const officerName =
    session?.user?.user_metadata?.full_name ??
    session?.user?.email ??
    "Officer on duty";
  const investigations = useWorkspaceStore((s) => Object.values(s.investigations));
  // Subscribe so the Live-UIP selector re-renders as new UIPs register.
  const uipOrder = useUipStore((s) => s.order);
  const uipsById = useUipStore((s) => s.byId);
  const registeredUips = useMemo(
    () => uipOrder.map((id) => uipsById[id]).filter(Boolean),
    [uipOrder, uipsById],
  );

  const [sourceMode, setSourceMode] = useState<SourceMode>("INVESTIGATION");
  const [reportType, setReportType] = useState<ReportType>("EXECUTIVE_BRIEF");
  const [period, setPeriod] = useState<ReportPeriod>("LAST_7D");
  const [selected, setSelected] = useState<string[]>([]);
  const [liveUipId, setLiveUipId] = useState<string>("");
  const [nlQuery, setNlQuery] = useState("");
  const [report, setReport] = useState<ReportPackage | null>(null);
  const [busy, setBusy] = useState<ExportFormat | "GENERATE" | null>(null);

  const sourceWorkspaces = useMemo(() => {
    if (selected.length === 0) return investigations;
    return investigations.filter((w) => selected.includes(w.id));
  }, [investigations, selected]);

  const generate = () => {
    setBusy("GENERATE");
    try {
      if (sourceMode === "LIVE_UIP") {
        // Live Intelligence Brief — resolve a single Canonical UIP via the
        // Intelligence Orchestrator. When no id is chosen we pick the
        // freshest snapshot the officer generated in this session.
        const uip =
          intelligenceOrchestrator.getUIP(liveUipId) ??
          intelligenceOrchestrator.getLatestUIP();
        if (!uip) {
          toast.error("No Canonical UIP available", {
            description:
              "Run a Copilot query first so a Unified Intelligence Package is registered in this session.",
          });
          return;
        }
        const pkg = buildReport({
          reportType,
          period,
          workspaces: [],
          officer: officerName,
          officerId,
          briefingId: uip.id,
          missionPlans: useMissionStore.getState().plans,
          uipSnapshots: [{ uip }],
          origin: "LIVE_UIP",
        });
        setReport(pkg);
        toast.success(`${REPORT_TYPE_LABEL[reportType]} assembled`, {
          description: `Live UIP ${uip.id} · confidence ${pkg.overallConfidence}%`,
        });
        return;
      }

      // Investigation-Based Brief — resolve every workspace's source_uip_id
      // through the orchestrator in one batch call.
      if (sourceWorkspaces.length === 0) {
        toast.error("No investigation workspaces selected", {
          description:
            "Open or create an Investigation Workspace, or switch to a Live Intelligence Brief.",
        });
        return;
      }
      const batch = intelligenceOrchestrator.getUIPsForWorkspaces(sourceWorkspaces);
      const uipSnapshots = batch.resolved
        .filter((r): r is typeof r & { uip: NonNullable<typeof r.uip> } => !!r.uip)
        .map((r) => ({ uip: r.uip, workspaceId: r.workspaceId }));
      const pkg = buildReport({
        reportType,
        period,
        workspaces: sourceWorkspaces,
        officer: officerName,
        officerId,
        briefingId: sourceWorkspaces[0]?.sourceUipId,
        missionPlans: useMissionStore.getState().plans,
        uipSnapshots,
        missingUipIds: batch.missing,
      });
      setReport(pkg);
      const missingNote =
        batch.missing.length > 0
          ? ` · ${batch.missing.length} UIP id${batch.missing.length === 1 ? "" : "s"} not registered in session`
          : "";
      toast.success(`${REPORT_TYPE_LABEL[reportType]} assembled`, {
        description: `${pkg.sections.length} sections · confidence ${pkg.overallConfidence}%${missingNote}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const runNl = () => {
    if (!nlQuery.trim()) return;
    const parsed = parseReportRequest(nlQuery);
    setReportType(parsed.reportType);
    setPeriod(parsed.period);
    toast.message("Interpreted request", {
      description: `${REPORT_TYPE_LABEL[parsed.reportType]} · ${REPORT_PERIOD_LABEL[parsed.period]} · parser confidence ${Math.round(parsed.confidence * 100)}%`,
    });
    // Give React a tick to flush state before generating.
    queueMicrotask(generate);
  };


  const download = async (format: ExportFormat) => {
    if (!report) return;
    setBusy(format);
    try {
      const blob = await exportReport(report, format);
      const ext = format.toLowerCase();
      downloadBlob(blob, `seaphore-${report.reportType.toLowerCase()}-${report.id}.${ext}`);
      toast.success(`${format} exported`);
    } catch (err) {
      toast.error(`Failed to export ${format}`, { description: String(err) });
    } finally {
      setBusy(null);
    }
  };

  // Scheduling is server-backed via SchedulesPanel / JobHistoryPanel below.

  return (
    <AppShell
      title="Maritime Intelligence Briefing Centre"
      subtitle="Reports assembled exclusively from Canonical UIP snapshots via the Intelligence Orchestrator."
    >
      <div className="space-y-6">
        {/* Golden Rule banner */}
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="font-medium">Source contract</div>
              <p className="text-muted-foreground">
                MIBC consumes intelligence <em>exclusively</em> through
                <code className="mx-1 rounded bg-muted px-1">intelligenceOrchestrator.getUIP(...)</code>
                and <code className="mx-1 rounded bg-muted px-1">getUIPBatch(...)</code>. Every risk,
                revenue, entity, and confidence number matches what the Evidence Explorer,
                Predictions, Revenue Leakage, and Operational Knowledge surfaces show — because
                they all read the same Canonical UIP.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Natural language */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              AI report generation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder={`e.g. "Generate yesterday's revenue report" · "Compare Lagos and Tin Can" · "Create executive briefing"`}
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runNl()}
              />
              <Button onClick={runNl} disabled={!nlQuery.trim()}>
                Interpret & generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Deterministic keyword parser — no LLM. Interpretation is displayed before execution.
            </p>
          </CardContent>
        </Card>

        {/* Configuration */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Report configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Source</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={sourceMode === "INVESTIGATION" ? "default" : "outline"}
                    onClick={() => setSourceMode("INVESTIGATION")}
                  >
                    Investigation-Based
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sourceMode === "LIVE_UIP" ? "default" : "outline"}
                    onClick={() => setSourceMode("LIVE_UIP")}
                  >
                    Live Intelligence Brief
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {sourceMode === "LIVE_UIP"
                    ? "Builds directly from a Canonical UIP snapshot (no investigation required)."
                    : "Resolves each selected workspace's source_uip_id through the orchestrator."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Report type</label>
                  <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPORT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {REPORT_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Period</label>
                  <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPORT_PERIODS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {REPORT_PERIOD_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {sourceMode === "LIVE_UIP" ? (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Canonical UIP ({registeredUips.length} registered this session)
                  </label>
                  <Select
                    value={liveUipId || (registeredUips[0]?.id ?? "")}
                    onValueChange={setLiveUipId}
                    disabled={registeredUips.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Latest UIP" />
                    </SelectTrigger>
                    <SelectContent>
                      {registeredUips.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.id} · {u.fused.canonical.length} entities · {u.rawEvidence.length} evidence
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {registeredUips.length === 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Run a Copilot query so a UIP is registered in this session.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Source investigations ({sourceWorkspaces.length} of {investigations.length})
                  </label>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                    {investigations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No investigations yet. Open the Investigation Dashboard to create one.
                      </p>
                    ) : (
                      investigations.map((w) => {
                        const on = selected.length === 0 || selected.includes(w.id);
                        return (
                          <label key={w.id} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => {
                                if (selected.length === 0) {
                                  setSelected(
                                    e.target.checked
                                      ? investigations.map((x) => x.id)
                                      : investigations.filter((x) => x.id !== w.id).map((x) => x.id),
                                  );
                                } else {
                                  setSelected((prev) =>
                                    e.target.checked
                                      ? [...prev, w.id]
                                      : prev.filter((id) => id !== w.id),
                                  );
                                }
                              }}
                            />
                            <span className="flex-1 truncate">{w.title}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {w.sourceUipId ? `UIP ${w.sourceUipId.slice(-6)}` : "no UIP"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {w.priority}
                            </Badge>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <Button onClick={generate} disabled={busy !== null} className="w-full">
                <FileText className="mr-2 h-4 w-4" />
                {busy === "GENERATE" ? "Generating…" : "Generate report"}
              </Button>
            </CardContent>
          </Card>

          <SchedulesPanel
            workspaceIds={selected.length === 0 ? [] : selected}
          />
        </div>


        <JobHistoryPanel />

        {/* Preview + exports */}
        {report && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{report.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["PDF", "DOCX", "XLSX", "PPTX"] as ExportFormat[]).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => download(f)}
                    >
                      <FileDown className="mr-1 h-3.5 w-3.5" />
                      {busy === f ? `${f}…` : f}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      toast.info("Email delivery is queued", {
                        description: "MIBC email dispatcher runs from Investigation Workspace payloads.",
                      })
                    }
                  >
                    Email
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge>Confidence {report.overallConfidence}%</Badge>
                <Badge variant="secondary">Origin · {report.origin.replace("_", " ")}</Badge>
                <Badge variant="outline">{report.sections.length} sections</Badge>
                <Badge variant="outline">{report.charts.length} charts</Badge>
                {report.sourceUipIds.length > 0 && (
                  <Badge variant="outline">
                    {report.sourceUipIds.length} Canonical UIP
                    {report.sourceUipIds.length === 1 ? "" : "s"}
                  </Badge>
                )}
                {report.sourceInvestigationIds.length > 0 && (
                  <Badge variant="outline">
                    {report.sourceInvestigationIds.length} investigation
                    {report.sourceInvestigationIds.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>

            </CardHeader>
            <CardContent>
              <Tabs defaultValue={report.sections[0]?.id}>
                <TabsList className="flex flex-wrap justify-start">
                  {report.sections.map((s) => (
                    <TabsTrigger key={s.id} value={s.id} className="text-xs">
                      {s.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {report.sections.map((s) => (
                  <TabsContent key={s.id} value={s.id} className="space-y-3 pt-3">
                    {s.body && <p className="text-sm text-foreground">{s.body}</p>}
                    {s.bullets?.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {s.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                    {s.columns && s.rows?.length ? (
                      <div className="overflow-x-auto rounded border">
                        <table className="min-w-full text-xs">
                          <thead className="bg-muted/60">
                            <tr>
                              {s.columns.map((c) => (
                                <th key={c} className="px-2 py-1 text-left font-medium">
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {s.rows.map((r, i) => (
                              <tr key={i} className="border-t">
                                {s.columns!.map((c) => (
                                  <td key={c} className="px-2 py-1">
                                    {String(r[c] ?? "")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {typeof s.confidence === "number" && (
                      <p className="text-xs text-muted-foreground">
                        Section confidence: {s.confidence}%
                      </p>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Evidence first. Explainable always. Officer decides. — {report?.provenanceLine ?? "Reports read only from Investigation Workspaces."}
        </p>
      </div>
    </AppShell>
  );
}
