CREATE TABLE public.finding_investigation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id text NOT NULL,
  finding_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  subject_label text,
  source text NOT NULL,
  source_record_id text,
  summary text,
  evidence_ref text,
  investigation_id uuid NOT NULL REFERENCES public.investigations(id) ON DELETE RESTRICT,
  linked_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finding_id, investigation_id)
);

CREATE INDEX finding_links_subject_idx ON public.finding_investigation_links (subject_id);
CREATE INDEX finding_links_investigation_idx ON public.finding_investigation_links (investigation_id);
CREATE INDEX finding_links_finding_idx ON public.finding_investigation_links (finding_id);

GRANT SELECT, INSERT ON public.finding_investigation_links TO authenticated;
GRANT ALL ON public.finding_investigation_links TO service_role;

ALTER TABLE public.finding_investigation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_finding_links"
  ON public.finding_investigation_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "officer_creates_finding_link"
  ON public.finding_investigation_links FOR INSERT TO authenticated
  WITH CHECK (linked_by = auth.uid());

CREATE OR REPLACE FUNCTION public.block_finding_link_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN RAISE EXCEPTION 'finding_investigation_links are append-only'; END $$;

CREATE TRIGGER finding_links_append_only
  BEFORE UPDATE OR DELETE ON public.finding_investigation_links
  FOR EACH ROW EXECUTE FUNCTION public.block_finding_link_mutation();