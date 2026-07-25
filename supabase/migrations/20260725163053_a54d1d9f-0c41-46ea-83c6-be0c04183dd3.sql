
-- ============================================================
-- MIBC background job scheduling
-- ============================================================

CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  report_type text NOT NULL,
  period text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')),
  workspace_ids text[] NOT NULL DEFAULT '{}',
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules owner select" ON public.report_schedules
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY "schedules owner insert" ON public.report_schedules
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "schedules owner update" ON public.report_schedules
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "schedules owner delete" ON public.report_schedules
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

CREATE INDEX report_schedules_owner_idx ON public.report_schedules(owner_user_id);
CREATE INDEX report_schedules_due_idx ON public.report_schedules(next_run_at) WHERE active;

CREATE TRIGGER trg_report_schedules_touch
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Jobs ------------------------------------------------------------------

CREATE TABLE public.report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.report_schedules(id) ON DELETE SET NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  period text NOT NULL,
  workspace_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','CLAIMED','SUCCEEDED','FAILED','DEAD')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  claimed_by text,
  claimed_at timestamptz,
  run_after timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  artifact_path text,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_jobs TO authenticated;
GRANT ALL ON public.report_jobs TO service_role;
ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs owner select" ON public.report_jobs
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY "jobs owner insert" ON public.report_jobs
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "jobs owner update" ON public.report_jobs
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX report_jobs_owner_idx ON public.report_jobs(owner_user_id, created_at DESC);
CREATE INDEX report_jobs_queue_idx ON public.report_jobs(owner_user_id, status, run_after);
CREATE INDEX report_jobs_schedule_idx ON public.report_jobs(schedule_id);

CREATE TRIGGER trg_report_jobs_touch
  BEFORE UPDATE ON public.report_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cadence helper --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mibc_next_run(_cadence text, _from timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _cadence
    WHEN 'DAILY'     THEN _from + interval '1 day'
    WHEN 'WEEKLY'    THEN _from + interval '7 days'
    WHEN 'MONTHLY'   THEN _from + interval '1 month'
    WHEN 'QUARTERLY' THEN _from + interval '3 months'
    ELSE _from + interval '1 day'
  END
$$;

-- Atomic claim (owner-scoped, RLS applies) -----------------------------

CREATE OR REPLACE FUNCTION public.mibc_claim_next_job(_worker text)
RETURNS SETOF public.report_jobs
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.report_jobs j
  SET status = 'CLAIMED',
      attempts = j.attempts + 1,
      claimed_by = _worker,
      claimed_at = now(),
      updated_at = now()
  WHERE j.id = (
    SELECT id FROM public.report_jobs
    WHERE owner_user_id = auth.uid()
      AND status = 'QUEUED'
      AND run_after <= now()
    ORDER BY scheduled_for ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mibc_claim_next_job(text) TO authenticated;

-- Dispatcher tick (called by pg_cron via the public tick route) --------

CREATE OR REPLACE FUNCTION public.mibc_dispatch_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enqueued int := 0;
  _reset    int := 0;
BEGIN
  WITH due AS (
    SELECT id, owner_user_id, report_type, period, workspace_ids, next_run_at, cadence
    FROM public.report_schedules
    WHERE active AND next_run_at <= now()
    FOR UPDATE SKIP LOCKED
  ),
  ins AS (
    INSERT INTO public.report_jobs
      (schedule_id, owner_user_id, report_type, period, workspace_ids, scheduled_for)
    SELECT id, owner_user_id, report_type, period, workspace_ids, next_run_at FROM due
    RETURNING id
  ),
  upd AS (
    UPDATE public.report_schedules s
    SET last_run_at = s.next_run_at,
        next_run_at = public.mibc_next_run(s.cadence, s.next_run_at),
        updated_at  = now()
    FROM due
    WHERE s.id = due.id
    RETURNING 1
  )
  SELECT count(*) INTO _enqueued FROM ins;

  UPDATE public.report_jobs
  SET status = 'QUEUED',
      claimed_by = NULL,
      claimed_at = NULL,
      run_after  = now() + (interval '1 minute' * power(2, LEAST(attempts, 6))::int),
      last_error = coalesce(last_error || ' | ', '') || 'reset: stuck in CLAIMED',
      updated_at = now()
  WHERE status = 'CLAIMED'
    AND claimed_at < now() - interval '10 minutes';
  GET DIAGNOSTICS _reset = ROW_COUNT;

  RETURN jsonb_build_object('enqueued', _enqueued, 'reset_stuck', _reset, 'at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.mibc_dispatch_tick() TO service_role;
