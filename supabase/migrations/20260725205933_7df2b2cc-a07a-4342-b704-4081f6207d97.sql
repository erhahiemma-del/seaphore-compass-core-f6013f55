
-- OKL Persistent Store (Sprint 2.4)
-- Immutable, append-only organizational memory.

CREATE TABLE public.okl_ingests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id text NOT NULL,
  investigation_title text,
  source_uip_id text NOT NULL,
  briefing_id text,
  officer_id uuid REFERENCES auth.users(id),
  officer_name text,
  package_id text NOT NULL,
  version int NOT NULL DEFAULT 1,
  overall_confidence int,
  overall_risk text,
  pattern_count int NOT NULL DEFAULT 0,
  entity_count int NOT NULL DEFAULT 0,
  decision_count int NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.okl_ingests TO authenticated;
GRANT ALL ON public.okl_ingests TO service_role;

ALTER TABLE public.okl_ingests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okl_ingests_select_authenticated"
  ON public.okl_ingests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "okl_ingests_insert_owner"
  ON public.okl_ingests FOR INSERT
  TO authenticated
  WITH CHECK (officer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_okl_ingest_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '[OKL] okl_ingests is append-only'; END $$;

CREATE TRIGGER okl_ingests_no_update BEFORE UPDATE ON public.okl_ingests
FOR EACH ROW EXECUTE FUNCTION public.block_okl_ingest_mutation();
CREATE TRIGGER okl_ingests_no_delete BEFORE DELETE ON public.okl_ingests
FOR EACH ROW EXECUTE FUNCTION public.block_okl_ingest_mutation();

CREATE INDEX okl_ingests_investigation_idx ON public.okl_ingests (investigation_id, version DESC);
CREATE INDEX okl_ingests_source_uip_idx ON public.okl_ingests (source_uip_id);
CREATE INDEX okl_ingests_created_idx ON public.okl_ingests (created_at DESC);

-- Flattened per-record rows for cross-investigation queries.
CREATE TABLE public.okl_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_id uuid NOT NULL REFERENCES public.okl_ingests(id) ON DELETE CASCADE,
  investigation_id text NOT NULL,
  source_uip_id text NOT NULL,
  briefing_id text,
  kind text NOT NULL CHECK (kind IN (
    'ENTITY','RELATIONSHIP','PATTERN','RISK','DECISION','OUTCOME','RECOMMENDATION'
  )),
  entity_id text,
  entity_label text,
  entity_kind text,
  pattern_kind text,
  risk_level text,
  confidence int,
  label text,
  detail text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.okl_records TO authenticated;
GRANT ALL ON public.okl_records TO service_role;

ALTER TABLE public.okl_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okl_records_select_authenticated"
  ON public.okl_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "okl_records_insert_via_ingest"
  ON public.okl_records FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.okl_ingests i
    WHERE i.id = ingest_id AND i.officer_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.block_okl_record_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '[OKL] okl_records is append-only'; END $$;

CREATE TRIGGER okl_records_no_update BEFORE UPDATE ON public.okl_records
FOR EACH ROW EXECUTE FUNCTION public.block_okl_record_mutation();
CREATE TRIGGER okl_records_no_delete BEFORE DELETE ON public.okl_records
FOR EACH ROW EXECUTE FUNCTION public.block_okl_record_mutation();

CREATE INDEX okl_records_entity_idx ON public.okl_records (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX okl_records_investigation_idx ON public.okl_records (investigation_id);
CREATE INDEX okl_records_kind_idx ON public.okl_records (kind);
CREATE INDEX okl_records_pattern_kind_idx ON public.okl_records (pattern_kind) WHERE pattern_kind IS NOT NULL;
CREATE INDEX okl_records_uip_idx ON public.okl_records (source_uip_id);
