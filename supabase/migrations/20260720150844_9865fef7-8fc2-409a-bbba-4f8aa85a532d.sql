
ALTER TABLE public.investigations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.evidence        ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_evidence_version_history_gin ON public.evidence USING gin (version_history);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_gin ON public.evidence USING gin (provenance);

DROP TRIGGER IF EXISTS trg_evidence_touch ON public.evidence;
CREATE TRIGGER trg_evidence_touch BEFORE UPDATE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.investigations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_investigations_active
  ON public.investigations (opened_at DESC) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_investigations_touch ON public.investigations;
CREATE TRIGGER trg_investigations_touch BEFORE UPDATE ON public.investigations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  investigation_id uuid REFERENCES public.investigations(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'copilot',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sessions" ON public.sessions;
CREATE POLICY "Users read own sessions" ON public.sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own sessions" ON public.sessions;
CREATE POLICY "Users insert own sessions" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own sessions" ON public.sessions;
CREATE POLICY "Users update own sessions" ON public.sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_investigation ON public.sessions (investigation_id);

DROP TRIGGER IF EXISTS trg_sessions_touch ON public.sessions;
CREATE TRIGGER trg_sessions_touch BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_entities_type_name ON public.entities (type, name);
CREATE INDEX IF NOT EXISTS idx_entities_attributes_gin ON public.entities USING gin (attributes);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON public.relationships (source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON public.relationships (target_id);
CREATE INDEX IF NOT EXISTS idx_candidate_rel_status ON public.candidate_relationships (status, created_at DESC);

-- Domain entities
INSERT INTO public.entities (type, name, aliases, confidence, attributes, source_id, source_name)
SELECT 'vessel', 'MV Crimson Endeavour', ARRAY['Crimson Endeavour']::text[], 'VERIFIED'::confidence_level,
       jsonb_build_object('imo','9837456','flag','LR','type','General Cargo','built',2015),
       'IMO-9837456', 'IMO Registry'
WHERE NOT EXISTS (SELECT 1 FROM public.entities WHERE name='MV Crimson Endeavour' AND type='vessel');

INSERT INTO public.entities (type, name, confidence, attributes, source_id, source_name)
SELECT 'company', 'Oceanic Lines Ltd', 'VERIFIED'::confidence_level,
       jsonb_build_object('jurisdiction','LR','registration','LR-88231','role','registered_owner'),
       'CORP-LR-88231', 'Liberia Corporate Registry'
WHERE NOT EXISTS (SELECT 1 FROM public.entities WHERE name='Oceanic Lines Ltd' AND type='company');

INSERT INTO public.entities (type, name, confidence, attributes, source_id, source_name)
SELECT 'port', 'Apapa Anchorage', 'VERIFIED'::confidence_level,
       jsonb_build_object('country','NG','city','Lagos','locode','NGAPP','lat',6.4489,'lon',3.3663),
       'UNLOCODE-NGAPP', 'UN/LOCODE'
WHERE NOT EXISTS (SELECT 1 FROM public.entities WHERE name='Apapa Anchorage' AND type='port');

INSERT INTO public.entities (type, name, confidence, attributes, source_id, source_name)
SELECT 'investigation', 'INV-2026-00431', 'VERIFIED'::confidence_level,
       jsonb_build_object('case_number','INV-2026-00431'),
       'INV-2026-00431', 'Seaphore Case Register'
WHERE NOT EXISTS (SELECT 1 FROM public.entities WHERE type='investigation' AND name='INV-2026-00431');

INSERT INTO public.investigations (id, case_number, scenario, status, lead_officer_id)
SELECT e.id, 'INV-2026-00431',
       'Suspected ownership obfuscation for MV Crimson Endeavour docking at Apapa Anchorage',
       'open'::investigation_status,
       (SELECT user_id FROM public.user_roles ORDER BY granted_at LIMIT 1)
FROM public.entities e
WHERE e.type='investigation' AND e.name='INV-2026-00431'
  AND NOT EXISTS (SELECT 1 FROM public.investigations WHERE case_number='INV-2026-00431')
  AND EXISTS (SELECT 1 FROM public.user_roles);

INSERT INTO public.relationships (source_id, target_id, type, confidence, attributes)
SELECT c.id, v.id, 'OPERATES', 'VERIFIED'::confidence_level,
       jsonb_build_object('source_id','IMO-9837456','source_name','IMO Registry')
FROM public.entities c, public.entities v
WHERE c.name='Oceanic Lines Ltd' AND c.type='company'
  AND v.name='MV Crimson Endeavour' AND v.type='vessel'
  AND NOT EXISTS (SELECT 1 FROM public.relationships r WHERE r.source_id=c.id AND r.target_id=v.id AND r.type='OPERATES');

INSERT INTO public.relationships (source_id, target_id, type, confidence, attributes)
SELECT v.id, p.id, 'DOCKED_AT', 'CORROBORATED'::confidence_level,
       jsonb_build_object('source_id','AIS-2026-04-01','source_name','MarineTraffic AIS')
FROM public.entities v, public.entities p
WHERE v.name='MV Crimson Endeavour' AND v.type='vessel'
  AND p.name='Apapa Anchorage' AND p.type='port'
  AND NOT EXISTS (SELECT 1 FROM public.relationships r WHERE r.source_id=v.id AND r.target_id=p.id AND r.type='DOCKED_AT');

INSERT INTO public.candidate_relationships (source_entity_id, target_entity_id, type, confidence, inferred_by, reasoning, status)
SELECT c.id, v.id, 'BENEFICIAL_OWNER_OF', 0.62,
       'ownership-inference-agent',
       'Shared director and registered address overlap with historical shell entities.',
       'pending'::candidate_status
FROM public.entities c, public.entities v
WHERE c.name='Oceanic Lines Ltd' AND c.type='company'
  AND v.name='MV Crimson Endeavour' AND v.type='vessel'
  AND NOT EXISTS (
    SELECT 1 FROM public.candidate_relationships cr
    WHERE cr.source_entity_id=c.id AND cr.target_entity_id=v.id AND cr.type='BENEFICIAL_OWNER_OF'
  );

-- Evidence entity + evidence row (evidence.id FK -> entities.id)
INSERT INTO public.entities (type, name, confidence, attributes, source_id, source_name)
SELECT 'document', 'AIS Track — MV Crimson Endeavour (seed)', 'VERIFIED'::confidence_level,
       jsonb_build_object('kind','ais_track','hash','sha256:seed-v1'),
       'AIS-2026-04-01', 'MarineTraffic AIS'
WHERE NOT EXISTS (
  SELECT 1 FROM public.entities
  WHERE type='document' AND name='AIS Track — MV Crimson Endeavour (seed)'
);

INSERT INTO public.evidence (id, investigation_id, evidence_type, source, version_history, provenance, content_hash)
SELECT ee.id, i.id, 'ais_track', 'MarineTraffic AIS',
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
FROM public.investigations i,
     public.entities ee
WHERE i.case_number='INV-2026-00431'
  AND ee.type='document' AND ee.name='AIS Track — MV Crimson Endeavour (seed)'
  AND NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.investigation_id=i.id AND e.content_hash='sha256:seed-v1');
