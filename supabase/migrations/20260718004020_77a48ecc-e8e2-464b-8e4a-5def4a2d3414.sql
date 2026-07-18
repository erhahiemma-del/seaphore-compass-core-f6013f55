
-- decisions
CREATE TABLE IF NOT EXISTS public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  decision text NOT NULL,
  reason text NOT NULL,
  notes text,
  officer_id uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  signature_data text NOT NULL,
  immutable boolean NOT NULL DEFAULT true
);

GRANT SELECT, INSERT ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "officers read decisions"
  ON public.decisions FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));

CREATE POLICY "officers insert their decisions"
  ON public.decisions FOR INSERT TO authenticated
  WITH CHECK (public.is_officer_or_above(auth.uid()) AND officer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_decision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '[API-4] decisions are immutable';
END; $$;

DROP TRIGGER IF EXISTS decisions_no_update ON public.decisions;
CREATE TRIGGER decisions_no_update
  BEFORE UPDATE OR DELETE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_decision_mutation();

-- audit_log immutability (API-3)
CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '[API-3] audit_log is insert-only';
END; $$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- copilot_rate_limit (API-6)
CREATE TABLE IF NOT EXISTS public.copilot_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  count integer NOT NULL DEFAULT 0,
  UNIQUE (officer_id, window_start)
);

GRANT SELECT, INSERT, UPDATE ON public.copilot_rate_limit TO authenticated;
GRANT ALL ON public.copilot_rate_limit TO service_role;

ALTER TABLE public.copilot_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "officers manage own rate limit"
  ON public.copilot_rate_limit FOR ALL TO authenticated
  USING (officer_id = auth.uid())
  WITH CHECK (officer_id = auth.uid());

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.signals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.evidence; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.signals REPLICA IDENTITY FULL;
ALTER TABLE public.evidence REPLICA IDENTITY FULL;

-- Storage RLS (API-5) — private buckets; signed URLs only
CREATE POLICY "seaphore buckets read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('evidence','manifests','exports'));

CREATE POLICY "seaphore buckets write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('evidence','manifests','exports'));
