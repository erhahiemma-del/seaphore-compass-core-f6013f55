import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  History,
  Download,
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listReportJobs, retryReportJob, signArtifactUrl } from "@/lib/mibc/schedules.functions";
import { formatRelative } from "@/lib/mibc/cadence";
import {
  REPORT_TYPE_LABEL,
  REPORT_PERIOD_LABEL,
  type ReportType,
  type ReportPeriod,
} from "@/services/mibc";

const STATUS_ICON: Record<string, React.ReactNode> = {
  QUEUED: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  CLAIMED: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  SUCCEEDED: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  FAILED: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  DEAD: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "outline",
  CLAIMED: "secondary",
  SUCCEEDED: "default",
  FAILED: "secondary",
  DEAD: "destructive",
};

export function JobHistoryPanel() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const list = useServerFn(listReportJobs);
  const retry = useServerFn(retryReportJob);
  const sign = useServerFn(signArtifactUrl);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["mibc", "jobs"],
    queryFn: () => list(),
    // Protected server fn — never call it without a signed-in session.
    enabled: !!session,
    refetchInterval: 8_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Job requeued");
      qc.invalidateQueries({ queryKey: ["mibc", "jobs"] });
    },
  });

  const openArtifact = async (path: string) => {
    try {
      const { url } = await sign({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error("Unable to sign download URL", { description: String(e) });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Job history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No jobs yet. Schedule a report or click "Run now".
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {STATUS_ICON[j.status]}
                    <Badge variant={STATUS_VARIANT[j.status]} className="text-[10px]">
                      {j.status}
                    </Badge>
                    <span className="truncate font-medium">
                      {REPORT_TYPE_LABEL[j.report_type as ReportType]}
                    </span>
                    <span className="text-muted-foreground">
                      · {REPORT_PERIOD_LABEL[j.period as ReportPeriod]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    scheduled {formatRelative(j.scheduled_for)} · attempts {j.attempts}/
                    {j.max_attempts}
                    {j.last_error ? (
                      <span className="ml-2 text-destructive">· {j.last_error.slice(0, 140)}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-1">
                  {j.status === "SUCCEEDED" && j.artifact_path ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openArtifact(j.artifact_path as string)}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" /> PDF
                    </Button>
                  ) : null}
                  {(j.status === "FAILED" || j.status === "DEAD") && (
                    <Button size="sm" variant="ghost" onClick={() => retryMutation.mutate(j.id)}>
                      <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
