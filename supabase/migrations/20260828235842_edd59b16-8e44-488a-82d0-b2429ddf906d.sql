-- Durable sanctions screening history and officer decisions.
--
-- Screenings are append-only: a later screening NEVER overwrites an earlier
-- one, because "what did we know on 28 Aug" is an evidentiary question. A
-- provider failure is stored as its own state with a failure reason so it can
-- never be mistaken for NO_MATCH.

CREATE TABLE public.sanctions_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_imo text,
  subject_name text NOT NULL,
  entity_kind text NOT NULL DEFAULT 'vessel',
  entity_role text,
  provider text NOT NULL,
  dataset text NOT NULL,
  scope text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'NOT_SCREENED','NO_MATCH','POSSIBLE_MATCH','REVIEW_REQUIRED','SCREENING_UNAVAILABLE'
  )),
  failure_reason text CHECK (failure_reason IN (
    'AUTHENTICATION_FAILED','RATE_LIMITED','PROVIDER_ERROR','NO_RECORD'
  )),
  error_message text,
  top_score numeric,
  candidate_count integer NOT NULL DEFAULT 0,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  screened_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sanctions_screenings_imo ON public.sanctions_screenings (subject_imo, screened_at DESC);
CREATE INDEX idx_sanctions_screenings_at ON public.sanctions_screenings (screened_at DESC);

GRANT SELECT, INSERT ON public.sanctions_screenings TO authenticated;
GRANT ALL ON public.sanctions_screenings TO service_role;
ALTER TABLE public.sanctions_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated officers read screenings"
  ON public.sanctions_screenings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers record their own screenings"
  ON public.sanctions_screenings FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE OR REPLACE FUNCTION public.block_sanctions_screening_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'sanctions_screenings is append-only'; END $$;

CREATE TRIGGER sanctions_screenings_append_only
  BEFORE UPDATE OR DELETE ON public.sanctions_screenings
  FOR EACH ROW EXECUTE FUNCTION public.block_sanctions_screening_mutation();

-- Officer decisions on a candidate. A provider score is never a decision, so
-- this table is the ONLY origin of CONFIRMED_MATCH.
CREATE TABLE public.sanctions_match_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id uuid NOT NULL REFERENCES public.sanctions_screenings(id) ON DELETE RESTRICT,
  subject_imo text,
  subject_name text NOT NULL,
  candidate_id text NOT NULL,
  candidate_caption text,
  decision text NOT NULL CHECK (decision IN ('CONFIRMED','DISMISSED')),
  reason text NOT NULL,
  note text,
  evidence_ref text,
  officer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sanctions_decisions_screening ON public.sanctions_match_decisions (screening_id);

GRANT SELECT, INSERT ON public.sanctions_match_decisions TO authenticated;
GRANT ALL ON public.sanctions_match_decisions TO service_role;
ALTER TABLE public.sanctions_match_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated officers read match decisions"
  ON public.sanctions_match_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers record their own match decisions"
  ON public.sanctions_match_decisions FOR INSERT TO authenticated
  WITH CHECK (officer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_sanctions_decision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'sanctions_match_decisions are immutable'; END $$;

CREATE TRIGGER sanctions_match_decisions_immutable
  BEFORE UPDATE OR DELETE ON public.sanctions_match_decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_sanctions_decision_mutation();