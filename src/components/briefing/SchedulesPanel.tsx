import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Power, Trash2, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createReportSchedule,
  listReportSchedules,
  toggleReportSchedule,
  deleteReportSchedule,
  enqueueReportJob,
} from "@/lib/mibc/schedules.functions";
import {
  CADENCE_LABEL,
  RECURRING_CADENCES,
  formatRelative,
  type RecurringCadence,
} from "@/lib/mibc/cadence";
import {
  REPORT_TYPES,
  REPORT_TYPE_LABEL,
  REPORT_PERIODS,
  REPORT_PERIOD_LABEL,
  type ReportType,
  type ReportPeriod,
} from "@/services/mibc";

export function SchedulesPanel({
  workspaceIds,
}: {
  workspaceIds: string[];
}) {
  const qc = useQueryClient();
  const list = useServerFn(listReportSchedules);
  const create = useServerFn(createReportSchedule);
  const toggle = useServerFn(toggleReportSchedule);
  const del = useServerFn(deleteReportSchedule);
  const enqueue = useServerFn(enqueueReportJob);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["mibc", "schedules"],
    queryFn: () => list(),
  });

  const [name, setName] = useState("Daily executive brief");
  const [reportType, setReportType] = useState<ReportType>("EXECUTIVE_BRIEF");
  const [period, setPeriod] = useState<ReportPeriod>("LAST_24H");
  const [cadence, setCadence] = useState<RecurringCadence>("DAILY");

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: { name, reportType, period, cadence, workspaceIds },
      }),
    onSuccess: () => {
      toast.success("Schedule created");
      qc.invalidateQueries({ queryKey: ["mibc", "schedules"] });
    },
    onError: (e: unknown) =>
      toast.error("Failed to create schedule", { description: String(e) }),
  });

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggle({ data: v }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["mibc", "schedules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Schedule removed");
      qc.invalidateQueries({ queryKey: ["mibc", "schedules"] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: (s: {
      id: string;
      reportType: string;
      period: string;
      workspace_ids: string[];
    }) =>
      enqueue({
        data: {
          reportType: s.reportType as ReportType,
          period: s.period as ReportPeriod,
          workspaceIds: s.workspace_ids,
          scheduleId: s.id,
        },
      }),
    onSuccess: () => {
      toast.success("Queued for the browser worker");
      qc.invalidateQueries({ queryKey: ["mibc", "jobs"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          Scheduled reports
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-md border p-3 md:grid-cols-5">
          <Input
            className="md:col-span-2"
            placeholder="Schedule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{REPORT_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_PERIODS.map((p) => (
                <SelectItem key={p} value={p}>{REPORT_PERIOD_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cadence} onValueChange={(v) => setCadence(v as RecurringCadence)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECURRING_CADENCES.map((c) => (
                <SelectItem key={c} value={c}>{CADENCE_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="md:col-span-5"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim()}
          >
            {createMutation.isPending ? "Creating…" : "Schedule report"}
          </Button>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading schedules…</p>
          ) : schedules.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No schedules yet. Configure one above — it will run on the cadence
              even if this tab is closed (a worker resumes it on the next visit).
            </p>
          ) : (
            schedules.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {CADENCE_LABEL[s.cadence as RecurringCadence]}
                    </Badge>
                    <Badge variant={s.active ? "default" : "secondary"} className="text-[10px]">
                      {s.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {REPORT_TYPE_LABEL[s.report_type as ReportType]} ·{" "}
                    {REPORT_PERIOD_LABEL[s.period as ReportPeriod]} · next{" "}
                    {formatRelative(s.next_run_at)} · last{" "}
                    {formatRelative(s.last_run_at)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => runNowMutation.mutate(s)}
                    title="Enqueue a job immediately"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      toggleMutation.mutate({ id: s.id, active: !s.active })
                    }
                    title={s.active ? "Pause" : "Resume"}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(s.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
