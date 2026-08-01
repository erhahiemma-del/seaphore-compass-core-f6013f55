/**
 * Browser job drainer for MIBC report jobs.
 *
 * MIBC's `buildReport` reads client-side stores (Investigation Workspace,
 * Missions). So the durable queue lives in the DB, but generation runs in
 * the officer's browser. This hook:
 *
 *   1. Every N seconds, atomically CLAIMs one QUEUED job (owner-scoped RPC).
 *   2. Assembles the report from the current workspace/mission state.
 *   3. Renders the PDF, uploads it to the `exports` bucket under
 *      `{userId}/{jobId}.pdf`, and marks the job SUCCEEDED.
 *   4. On any failure, calls failReportJob which reschedules with
 *      exponential backoff or dead-letters after max_attempts.
 *
 * The drainer is idempotent-safe: if the tab closes mid-run, the server-side
 * "stuck in CLAIMED > 10 min" resweep re-queues the job with backoff.
 */

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceStore } from "@/stores/workspace.store";
import { useMissionStore } from "@/services/mission";
import { buildReport, exportReport, type ReportType, type ReportPeriod } from "@/services/mibc";
import { intelligenceOrchestrator } from "@/services/intelligence-orchestrator";

import { claimNextReportJob, completeReportJob, failReportJob } from "./schedules.functions";

const POLL_MS = 15_000;

function workerId(): string {
  if (typeof window === "undefined") return "ssr";
  const k = "seaphore.mibc.workerId";
  let id = window.localStorage.getItem(k);
  if (!id) {
    id = `worker-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(k, id);
  }
  return id;
}

export function useReportJobDrainer(enabled = true): void {
  const claim = useServerFn(claimNextReportJob);
  const complete = useServerFn(completeReportJob);
  const fail = useServerFn(failReportJob);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;

    const tick = async () => {
      if (runningRef.current) return;
      // Only drain when a session exists.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      runningRef.current = true;
      try {
        const job = await claim({ data: { worker: workerId() } });
        if (!job || cancelled) return;

        try {
          const investigations = Object.values(useWorkspaceStore.getState().investigations);
          const targetIds: string[] = job.workspace_ids ?? [];
          const workspaces =
            targetIds.length === 0
              ? investigations
              : investigations.filter((w) => targetIds.includes(w.id));

          if (workspaces.length === 0) {
            throw new Error("No investigation workspaces available in this browser session.");
          }

          const batch = intelligenceOrchestrator.getUIPsForWorkspaces(workspaces);
          const uipSnapshots = batch.resolved
            .filter((r): r is typeof r & { uip: NonNullable<typeof r.uip> } => !!r.uip)
            .map((r) => ({ uip: r.uip, workspaceId: r.workspaceId }));

          const pkg = buildReport({
            reportType: job.report_type as ReportType,
            period: job.period as ReportPeriod,
            workspaces,
            officer: sess.session.user.email ?? "Officer on duty",
            missionPlans: useMissionStore.getState().plans,
            uipSnapshots,
            missingUipIds: batch.missing,
          });

          const blob = await exportReport(pkg, "PDF");
          const path = `${sess.session.user.id}/${job.id}.pdf`;
          const { error: upErr } = await supabase.storage
            .from("exports")
            .upload(path, blob, { upsert: true, contentType: "application/pdf" });
          if (upErr) throw upErr;

          await complete({
            data: {
              id: job.id,
              artifactPath: path,
              summary: {
                reportId: pkg.id,
                origin: pkg.origin,
                overallConfidence: pkg.overallConfidence,
                sections: pkg.sections.length,
                workspaces: workspaces.length,
                canonicalUips: pkg.sourceUipIds.length,
                missingUips: batch.missing.length,
              },
            },
          });
        } catch (err) {
          await fail({
            data: {
              id: job.id,
              error: (err as Error).message ?? String(err),
            },
          });
        }
      } catch {
        // claim can fail transiently (network); ignore.
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), POLL_MS);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, claim, complete, fail]);
}
