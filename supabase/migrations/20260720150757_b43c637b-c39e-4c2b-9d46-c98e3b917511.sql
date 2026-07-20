
-- Only the evidence seed differs; re-run schema-safe changes idempotently
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS version_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

WITH ev_entity AS (
  INSERT INTO public.entities (type, name, confidence, attributes, source_id, source_name)
  SELECT 'document', 'AIS Track — MV Crimson Endeavour (seed)', 'VERIFIED'::confidence_level,
         jsonb_build_object('kind','ais_track','hash','sha256:seed-v1'),
         'AIS-2026-04-01', 'MarineTraffic AIS'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.entities
    WHERE type='document' AND name='AIS Track — MV Crimson Endeavour (seed)'
  )
  RETURNING id
),
picked AS (
  SELECT id FROM ev_entity
  UNION ALL
  SELECT id FROM public.entities
  WHERE type='document' AND name='AIS Track — MV Crimson Endeavour (seed)'
  LIMIT 1
)
INSERT INTO public.evidence (id, investigation_id, evidence_type, source, version_history, provenance, content_hash)
SELECT (SELECT id FROM picked LIMIT 1),
       i.id, 'ais_track', 'MarineTraffic AIS',
  jsonb_build_array(jsonb_build_object(
    'version',1,'at',now(),'actor','ingest.marinetraffic',
    'change','initial ingest','hash','sha256:seed-v1'
  )),
  jsonb_build_object(
    'collected_from','MarineTraffic API v2','method','poll',
    'chain_of_custody', jsonb_build_array('ingest.marinetraffic','ais.normalizer'),
    'received_at', now()
  ),
  'sha256:seed-v1'
FROM public.investigations i
WHERE i.case_number='INV-2026-00431'
  AND NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.investigation_id=i.id AND e.content_hash='sha256:seed-v1');
