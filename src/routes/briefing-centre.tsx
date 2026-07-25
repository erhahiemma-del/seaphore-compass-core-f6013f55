import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspaceStore } from "@/stores/workspace.store";
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
  REPORT_CADENCES,
  type ReportType,
  type ReportPeriod,
  type ReportCadence,
  type ExportFormat,
  type ReportPackage,
} from "@/services/mibc";
import { FileText, FileDown, Sparkles, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/briefing-centre")({
  head: () => ({
    meta: [
      { title: "Maritime Intelligence Briefing Centre · Seaphore" },
      {
        name: "description",
        content:
          "Enterprise reporting engine. Reports read only from Maritime Investigation Workspaces — never from raw connectors.",
      },
      { property: "og:title", content: "Maritime Intelligence Briefing Centre" },
      {
        property: "og:description",
        content: "Executive-quality briefings sourced from curated investigation intelligence.",
      },
    ],
  }),
  component: BriefingCentre,
});

type ScheduledJob = {
  id: string;
  reportType: ReportType;
  period: ReportPeriod;
  cadence: ReportCadence;
  createdAt: string;
};

function BriefingCentre() {
  const investigations = useWorkspaceStore((s) => Object.values(s.investigations));
  const [reportType, setReportType] = useState<ReportType>("EXECUTIVE_BRIEF");
  const [period, setPeriod] = useState<ReportPeriod>("LAST_7D");
  const [cadence, setCadence] = useState<ReportCadence>("ON_DEMAND");
  const [selected, setSelected] = useState<string[]>([]);
  const [nlQuery, setNlQuery] = useState("");
  const [report, setReport] = useState<ReportPackage | null>(null);
  const [busy, setBusy] = useState<ExportFormat | "GENERATE" | null>(null);
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);

  const sourceWorkspaces = useMemo(() => {
    if (selected.length === 0) return investigations;
    return investigations.filter((w) => selected.includes(w.id));
  }, [investigations, selected]);

  const generate = () => {
    if (sourceWorkspaces.length === 0) {
      toast.error("No investigation workspaces available", {
        description:
          "Reports read only from Investigation Workspaces. Create or open one first.",
      });
      return;
    }
    setBusy("GENERATE");
    try {
      const pkg = buildReport({
        reportType,
        period,
        workspaces: sourceWorkspaces,
        officer: "Officer on duty",
      });
      setReport(pkg);
      toast.success(`${REPORT_TYPE_LABEL[reportType]} assembled`, {
        description: `${pkg.sections.length} sections · confidence ${pkg.overallConfidence}%`,
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

  const schedule = () => {
    const job: ScheduledJob = {
      id: `sched-${Date.now().toString(36)}`,
      reportType,
      period,
      cadence,
      createdAt: new Date().toISOString(),
    };
    setSchedules((s) => [job, ...s]);
    toast.success(`Scheduled ${REPORT_TYPE_LABEL[reportType]}`, {
      description: `${cadence.toLowerCase()} · from Investigation Workspaces`,
    });
  };

  return (
    <AppShell
      title="Maritime Intelligence Briefing Centre"
      subtitle="Reports read only from Investigation Workspaces. Never raw connector data."
    >
      <div className="space-y-6">
        {/* Golden Rule banner */}
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="font-medium">Source contract</div>
              <p className="text-muted-foreground">
                MIBC consumes ONLY the Maritime Investigation Workspace. Charts reference evidence.
                Recommendations reference the Operational Knowledge Layer. Every conclusion is
                explainable and traceable.
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
                placeholder='e.g. "Generate yesterday\'s revenue report" · "Compare Lagos and Tin Can" · "Create executive briefing"'
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
                                // Materialise the "all" state so a click can toggle one off.
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
                            {w.priority}
                          </Badge>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <Button onClick={generate} disabled={busy !== null} className="w-full">
                <FileText className="mr-2 h-4 w-4" />
                {busy === "GENERATE" ? "Generating…" : "Generate report"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cadence</label>
                <Select value={cadence} onValueChange={(v) => setCadence(v as ReportCadence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_CADENCES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0) + c.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={schedule} className="w-full">
                Schedule this report
              </Button>
              <div className="space-y-1 text-xs">
                {schedules.length === 0 ? (
                  <p className="text-muted-foreground">No scheduled runs yet.</p>
                ) : (
                  schedules.map((j) => (
                    <div key={j.id} className="flex items-center justify-between rounded border px-2 py-1">
                      <span>
                        {REPORT_TYPE_LABEL[j.reportType]} · {REPORT_PERIOD_LABEL[j.period]}
                      </span>
                      <Badge variant="outline">{j.cadence}</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

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
                <Badge variant="outline">{report.sections.length} sections</Badge>
                <Badge variant="outline">{report.charts.length} charts</Badge>
                <Badge variant="outline">
                  {report.sourceInvestigationIds.length} investigation
                  {report.sourceInvestigationIds.length === 1 ? "" : "s"}
                </Badge>
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
