CREATE TABLE public.intelligence_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_type text NOT NULL,
  severity text NOT NULL DEFAULT 'ATTENTION' CHECK (severity IN ('ATTENTION','WARNING','CRITICAL')),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','UNDER_REVIEW','CONFIRMED','DISMISSED','INVESTIGATION_OPEN','RESOLVED')),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  subject_name text,
  description text NOT NULL,
  why_attention text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  source_record_id text,
  confidence text,
  data_state text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  related jsonb NOT NULL DEFAULT '{}'::jsonb,
  latitude double precision,
  longitude double precision,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX intelligence_findings_source_record_idx
  ON public.intelligence_findings (source, source_record_id)
  WHERE source_record_id IS NOT NULL;
CREATE INDEX intelligence_findings_subject_idx ON public.intelligence_findings (subject_id);
CREATE INDEX intelligence_findings_status_idx ON public.intelligence_findings (status, detected_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.intelligence_findings TO authenticated;
GRANT ALL ON public.intelligence_findings TO service_role;
ALTER TABLE public.intelligence_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers read findings" ON public.intelligence_findings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers create findings" ON public.intelligence_findings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Officers update finding status" ON public.intelligence_findings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.finding_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_id uuid NOT NULL REFERENCES public.intelligence_findings(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('CONFIRM','DISMISS','OPEN_INVESTIGATION','NOTE','RESOLVE')),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  reason text,
  note text,
  evidence_ref text,
  investigation_id uuid,
  officer_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX finding_decisions_finding_idx ON public.finding_decisions (finding_id, decided_at DESC);

GRANT SELECT, INSERT ON public.finding_decisions TO authenticated;
GRANT ALL ON public.finding_decisions TO service_role;
ALTER TABLE public.finding_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers read finding decisions" ON public.finding_decisions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers record their decisions" ON public.finding_decisions
  FOR INSERT TO authenticated WITH CHECK (officer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_finding_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'finding_decisions is append-only';
END;
$$;

CREATE TRIGGER finding_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.finding_decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_finding_decision_mutation();