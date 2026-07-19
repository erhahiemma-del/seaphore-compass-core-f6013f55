
-- Data Source Matrix registry + health monitoring
CREATE TYPE public.data_source_status AS ENUM ('ACTIVE','PARTIAL','PLANNED','INFERRED','NOT_IN_SCOPE');
CREATE TYPE public.data_source_health_state AS ENUM ('OK','DEGRADED','DOWN','UNKNOWN','NOT_APPLICABLE');

CREATE TABLE public.data_sources (
  id text PRIMARY KEY,                       -- stable slug e.g. 'spire', 'datalastic'
  data_type text NOT NULL,                   -- e.g. 'Vessel AIS positions (live)'
  provider text NOT NULL,                    -- e.g. 'Spire Maritime'
  status public.data_source_status NOT NULL,
  kind text NOT NULL,                        -- 'ais' | 'sanctions' | 'ocr' | 'ai' | ...
  default_confidence text NOT NULL,          -- confidence tier label
  citation text NOT NULL,                    -- audit citation string
  notes text,
  scope text,                                -- 'osint' | 'commercial' | 'internal' | 'user' | 'ai'
  active_from timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.data_source_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  state public.data_source_health_state NOT NULL,
  latency_ms integer,
  error_code text,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_source_health_source_time
  ON public.data_source_health (source_id, checked_at DESC);

GRANT SELECT ON public.data_sources TO authenticated, anon;
GRANT ALL ON public.data_sources TO service_role;
GRANT SELECT ON public.data_source_health TO authenticated;
GRANT ALL ON public.data_source_health TO service_role;

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_sources readable by all" ON public.data_sources
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "data_sources writable by admin" ON public.data_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "data_source_health readable by authed" ON public.data_source_health
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "data_source_health writable by admin" ON public.data_source_health
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER trg_data_sources_touch
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed matrix (SEAPHORE Data Source Matrix — Part H, v1.0)
INSERT INTO public.data_sources (id, data_type, provider, status, kind, default_confidence, citation, scope, notes) VALUES
 ('spire',            'Vessel AIS positions (live)',       'Spire Maritime',                  'PLANNED',      'ais',         'OBSERVED',    'Spire Maritime AIS (spire.com)',                        'commercial', 'Until active: show last-known position with OBSERVED chip + timestamp. Never shown as current.'),
 ('datalastic',       'Vessel AIS positions (historical)', 'Datalastic',                      'ACTIVE',       'ais_history', 'OBSERVED',    'Datalastic historical AIS (datalastic.com)',            'commercial', 'Historical route data for voyage workspace and knowledge graph.'),
 ('imo_gisis',        'Vessel particulars',                'IMO GISIS + Equasis',             'ACTIVE',       'vessel_ref',  'VERIFIED',    'IMO GISIS & Equasis vessel registry',                   'osint',      'IMO, type, flag, GT, DWT, class, builder.'),
 ('cac_nigeria',      'Company registration',              'Nigeria CAC',                     'ACTIVE',       'company_reg', 'VERIFIED',    'Nigeria Corporate Affairs Commission (cac.gov.ng)',     'osint',      'CAC number, directors, registered address.'),
 ('sanctions',        'Sanctions screening',               'OFAC SDN + UN Consolidated',      'ACTIVE',       'sanctions',   'VERIFIED',    'OFAC SDN + UN Consolidated Sanctions List',             'osint',      'Auto-checked on entity creation.'),
 ('manifest_upload',  'Manifests',                         'User upload (PDF/XLSX/JPG)',      'ACTIVE',       'upload',      'DECLARED',    'Officer-uploaded manifest document',                    'user',       'OCR via Google Vision. Validation via server function.'),
 ('bol_upload',       'Bills of Lading',                   'User upload',                     'ACTIVE',       'upload',      'DECLARED',    'Officer-uploaded Bill of Lading document',              'user',       'Extracted and linked to voyage.'),
 ('volza',            'Trade data (import records)',       'Volza (Nigeria lanes)',           'ACTIVE',       'trade',       'CORROBORATED','Volza cross-border trade dataset (volza.com)',          'commercial', 'Cross-border comparison for manifest validation.'),
 ('port_congestion',  'Port congestion',                   'NPA / internal model',            'INFERRED',     'model',       'INFERRED',    'Seaphore port congestion model (NPA + queue history)',  'internal',   'Computed from vessel queue + historical patterns.'),
 ('nimasa_levy',      'Revenue / levy data',               'NIMASA internal system',          'ACTIVE',       'revenue',     'VERIFIED',    'NIMASA 3% levy system of record',                       'internal',   '3% levy records, assessments, receipts.'),
 ('platts',           'Cargo values (market price)',       'Platts / Trading Economics',      'PLANNED',      'market',      'CORROBORATED','S&P Global Platts / Trading Economics',                 'commercial', 'Used for declared-value vs market-value comparison.'),
 ('flag_registry',    'Flag registry',                     'Panama · Liberia · Marshall Is.', 'ACTIVE',       'flag',        'VERIFIED',    'National flag state registries',                        'osint',      'Flag state verification.'),
 ('companies_house',  'Corporate ownership',               'UK Companies House + Offshore',   'PARTIAL',      'ownership',   'DECLARED',    'UK Companies House + offshore corporate registries',    'osint',      'Beneficial ownership often INFERRED, not VERIFIED.'),
 ('pi_insurance',     'P&I insurance',                     'Insurer publications',            'PLANNED',      'insurance',   'DECLARED',    'P&I Club member publications',                          'commercial', 'For vessel compliance panel.'),
 ('weather',          'Weather/sea state',                 '—',                               'NOT_IN_SCOPE', 'weather',     'OBSERVED',    'n/a',                                                   'osint',      'Removed from Mission Control. Not an officer action domain.'),
 ('google_vision',    'OCR (manifest/document)',           'Google Vision API',               'ACTIVE',       'ocr',         'DECLARED',    'Google Cloud Vision OCR',                               'ai',         'Called via server function on upload.'),
 ('gemini',           'AI reasoning',                      'Google Gemini 1.5 Pro',           'ACTIVE',       'ai',          'INFERRED',    'Google Gemini 1.5 Pro reasoning',                       'ai',         'Copilot queries, pattern interpretation, brief generation.');
