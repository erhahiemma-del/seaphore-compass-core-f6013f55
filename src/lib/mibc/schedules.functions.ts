/**
 * Server functions for MIBC report scheduling & job queue.
 * All calls are scoped by RLS to the authenticated officer.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REPORT_TYPES, REPORT_PERIODS } from "@/services/mibc/types";

const CADENCES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"] as const;

const createInput = z.object({
  name: z.string().min(1).max(120),
  reportType: z.enum(REPORT_TYPES as readonly [string, ...string[]]),
  period: z.enum(REPORT_PERIODS as readonly [string, ...string[]]),
  cadence: z.enum(CADENCES),
  workspaceIds: z.array(z.string()).max(100).default([]),
  firstRunAt: z.string().datetime().optional(),
});

export const createReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createInput.parse(raw))
  .handler(async ({ data, context }) => {
    const nextRun = data.firstRunAt
      ? new Date(data.firstRunAt).toISOString()
      : new Date(Date.now() + 60_000).toISOString();
    const { data: row, error } = await context.supabase
      .from("report_schedules")
      .insert({
        owner_user_id: context.userId,
        name: data.name,
        report_type: data.reportType,
        period: data.period,
        cadence: data.cadence,
        workspace_ids: data.workspaceIds,
        next_run_at: nextRun,
        active: true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const listReportSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("report_schedules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const toggleInput = z.object({ id: z.string().uuid(), active: z.boolean() });
export const toggleReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => toggleInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("report_schedules")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const idInput = z.object({ id: z.string().uuid() });

export const deleteReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("report_schedules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const enqueueInput = z.object({
  reportType: z.enum(REPORT_TYPES as readonly [string, ...string[]]),
  period: z.enum(REPORT_PERIODS as readonly [string, ...string[]]),
  workspaceIds: z.array(z.string()).max(100).default([]),
  scheduleId: z.string().uuid().optional(),
});
export const enqueueReportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => enqueueInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_jobs")
      .insert({
        owner_user_id: context.userId,
        schedule_id: data.scheduleId ?? null,
        report_type: data.reportType,
        period: data.period,
        workspace_ids: data.workspaceIds,
        status: "QUEUED",
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const listReportJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("report_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

const workerInput = z.object({ worker: z.string().min(1).max(80) });
export const claimNextReportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workerInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("mibc_claim_next_job", {
      _worker: data.worker,
    });
    if (error) throw error;
    return (rows && rows[0]) ?? null;
  });

const completeInput = z.object({
  id: z.string().uuid(),
  artifactPath: z.string().min(1).max(500),
  summary: z.record(z.string(), z.unknown()).optional(),
});
export const completeReportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => completeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("report_jobs")
      .update({
        status: "SUCCEEDED",
        artifact_path: data.artifactPath,
        result_summary: (data.summary ?? {}) as never,
        last_error: null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const failInput = z.object({
  id: z.string().uuid(),
  error: z.string().min(1).max(2000),
});
export const failReportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => failInput.parse(raw))
  .handler(async ({ data, context }) => {
    // Read current attempts to decide whether to retry or dead-letter.
    const { data: job, error: readErr } = await context.supabase
      .from("report_jobs")
      .select("attempts, max_attempts")
      .eq("id", data.id)
      .single();
    if (readErr) throw readErr;

    const dead = job.attempts >= job.max_attempts;
    // Exponential backoff: 1, 2, 4, 8, 16, 32 minutes
    const backoffMinutes = Math.min(Math.pow(2, job.attempts), 64);
    const runAfter = new Date(Date.now() + backoffMinutes * 60_000).toISOString();

    const { error } = await context.supabase
      .from("report_jobs")
      .update({
        status: dead ? "DEAD" : "QUEUED",
        run_after: runAfter,
        last_error: data.error.slice(0, 2000),
        claimed_by: null,
        claimed_at: null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true, retryIn: dead ? null : backoffMinutes };
  });

export const retryReportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("report_jobs")
      .update({
        status: "QUEUED",
        run_after: new Date().toISOString(),
        attempts: 0,
        claimed_by: null,
        claimed_at: null,
        last_error: null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const signInput = z.object({ path: z.string().min(1).max(500) });
export const signArtifactUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => signInput.parse(raw))
  .handler(async ({ data, context }) => {
    // RLS on storage.objects ensures officers only sign their own files.
    if (!data.path.startsWith(`${context.userId}/`)) {
      throw new Error("Forbidden path");
    }
    const { data: signed, error } = await context.supabase.storage
      .from("exports")
      .createSignedUrl(data.path, 60 * 60 * 24); // 24h
    if (error) throw error;
    return { url: signed.signedUrl };
  });
