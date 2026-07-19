
DO $$ BEGIN CREATE TYPE public.evidence_grade AS ENUM ('VERIFIED','CORROBORATED','OBSERVED','REPORTED','INFERRED','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.candidate_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.briefing_mode AS ENUM ('lookup','assessment','investigation','forecast'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.workspace_kind AS ENUM ('ownership','revenue','compliance','evidence','vessel','port'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.candidate_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.300 CHECK (confidence >= 0 AND confidence <= 1),
  inferred_by TEXT NOT NULL,
  reasoning TEXT,
  status public.candidate_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.candidate_relationships TO authenticated;
GRANT ALL ON public.candidate_relationships TO service_role;
ALTER TABLE public.candidate_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read candidates" ON public.candidate_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "officers insert candidates" ON public.candidate_relationships FOR INSERT TO authenticated WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers update candidates" ON public.candidate_relationships FOR UPDATE TO authenticated USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE TRIGGER touch_candidate_rel BEFORE UPDATE ON public.candidate_relationships FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_cand_rel_status ON public.candidate_relationships(status);
CREATE INDEX IF NOT EXISTS idx_cand_rel_source ON public.candidate_relationships(source_entity_id);

CREATE TABLE IF NOT EXISTS public.intel_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  officer_id UUID NOT NULL REFERENCES auth.users(id),
  query TEXT NOT NULL,
  workspace public.workspace_kind,
  investigation_id UUID REFERENCES public.investigations(id) ON DELETE SET NULL,
  mode public.briefing_mode NOT NULL,
  classification JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  intelligence_status TEXT NOT NULL DEFAULT 'complete',
  sources_queried INT NOT NULL DEFAULT 0,
  sources_responded INT NOT NULL DEFAULT 0,
  sources_corroborated INT NOT NULL DEFAULT 0,
  confidence_matrix JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms INT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.intel_briefings TO authenticated;
GRANT ALL ON public.intel_briefings TO service_role;
ALTER TABLE public.intel_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officer reads intel briefings" ON public.intel_briefings FOR SELECT TO authenticated USING (officer_id = auth.uid() OR public.is_officer_or_above(auth.uid()));
CREATE POLICY "officer writes intel briefings" ON public.intel_briefings FOR INSERT TO authenticated WITH CHECK (officer_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_intel_briefings_officer ON public.intel_briefings(officer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_briefings_investigation ON public.intel_briefings(investigation_id);

CREATE TABLE IF NOT EXISTS public.briefing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID NOT NULL REFERENCES public.intel_briefings(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES auth.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('agree','disagree','modify','dismiss')),
  justification TEXT,
  modifications JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.briefing_overrides TO authenticated;
GRANT ALL ON public.briefing_overrides TO service_role;
ALTER TABLE public.briefing_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read overrides" ON public.briefing_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "officer writes override" ON public.briefing_overrides FOR INSERT TO authenticated WITH CHECK (officer_id = auth.uid());
CREATE OR REPLACE FUNCTION public.block_override_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION '[HR-9] briefing_overrides are immutable'; END $$;
DROP TRIGGER IF EXISTS block_override_upd ON public.briefing_overrides;
CREATE TRIGGER block_override_upd BEFORE UPDATE OR DELETE ON public.briefing_overrides FOR EACH ROW EXECUTE FUNCTION public.block_override_mutation();

CREATE TABLE IF NOT EXISTS public.orchestration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_ids UUID[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  emitted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orchestration_events TO authenticated;
GRANT ALL ON public.orchestration_events TO service_role;
ALTER TABLE public.orchestration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read orch events" ON public.orchestration_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth append orch events" ON public.orchestration_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.block_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'orchestration_events are append-only'; END $$;
DROP TRIGGER IF EXISTS block_orch_upd ON public.orchestration_events;
CREATE TRIGGER block_orch_upd BEFORE UPDATE OR DELETE ON public.orchestration_events FOR EACH ROW EXECUTE FUNCTION public.block_event_mutation();
CREATE INDEX IF NOT EXISTS idx_orch_events_type ON public.orchestration_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.officer_action_counters (
  officer_id UUID NOT NULL REFERENCES auth.users(id),
  action_key TEXT NOT NULL,
  window_day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (officer_id, action_key, window_day)
);
GRANT SELECT, INSERT, UPDATE ON public.officer_action_counters TO authenticated;
GRANT ALL ON public.officer_action_counters TO service_role;
ALTER TABLE public.officer_action_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officer reads own counter" ON public.officer_action_counters FOR SELECT TO authenticated USING (officer_id = auth.uid());
CREATE POLICY "officer writes own counter" ON public.officer_action_counters FOR INSERT TO authenticated WITH CHECK (officer_id = auth.uid());
CREATE POLICY "officer updates own counter" ON public.officer_action_counters FOR UPDATE TO authenticated USING (officer_id = auth.uid()) WITH CHECK (officer_id = auth.uid());
