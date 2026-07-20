
-- OSINT Integration Engine tables

-- 1. Connector registry
CREATE TABLE public.osint_connectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('AIS','SANCTIONS','REGISTRY','WEATHER','IMAGERY','TRADE','COMPLIANCE')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('none','api_key','oauth','credentials')),
  endpoint TEXT NOT NULL,
  polling_interval_minutes INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- health metrics
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success','partial','failed')),
  records_total BIGINT NOT NULL DEFAULT 0,
  records_last_run INTEGER NOT NULL DEFAULT 0,
  error_rate_7d NUMERIC NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy','degraded','down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_connectors TO authenticated;
GRANT ALL ON public.osint_connectors TO service_role;
ALTER TABLE public.osint_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read connectors" ON public.osint_connectors FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage connectors" ON public.osint_connectors FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TRIGGER osint_connectors_touch BEFORE UPDATE ON public.osint_connectors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Sync runs
CREATE TABLE public.osint_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES public.osint_connectors(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  records_fetched INTEGER NOT NULL DEFAULT 0,
  records_ingested INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_sync_runs TO authenticated;
GRANT ALL ON public.osint_sync_runs TO service_role;
ALTER TABLE public.osint_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read runs" ON public.osint_sync_runs FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage runs" ON public.osint_sync_runs FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE INDEX osint_sync_runs_connector_idx ON public.osint_sync_runs(connector_id, started_at DESC);

-- 3. Canonical records
CREATE TABLE public.osint_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('VESSEL','VOYAGE','AGENT','CARGO','OWNER','PORT','SANCTION','WEATHER','ALERT')),
  entity_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('OBSERVED','DECLARED','INFERRED','CORROBORATED','VERIFIED','AUDITED')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  sync_run_id UUID REFERENCES public.osint_sync_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_records TO authenticated;
GRANT ALL ON public.osint_records TO service_role;
ALTER TABLE public.osint_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read records" ON public.osint_records FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage records" ON public.osint_records FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE INDEX osint_records_entity_idx ON public.osint_records(entity_type, entity_id);
CREATE INDEX osint_records_source_idx ON public.osint_records(source_id, fetched_at DESC);
CREATE TRIGGER osint_records_touch BEFORE UPDATE ON public.osint_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Dead letter queue
CREATE TABLE public.osint_dead_letters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID REFERENCES public.osint_connectors(id) ON DELETE CASCADE,
  sync_run_id UUID REFERENCES public.osint_sync_runs(id) ON DELETE SET NULL,
  source_ref TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_dead_letters TO authenticated;
GRANT ALL ON public.osint_dead_letters TO service_role;
ALTER TABLE public.osint_dead_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read dlq" ON public.osint_dead_letters FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage dlq" ON public.osint_dead_letters FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));

-- 5. Entity index
CREATE TABLE public.osint_entity_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  record_id UUID NOT NULL REFERENCES public.osint_records(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, record_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_entity_index TO authenticated;
GRANT ALL ON public.osint_entity_index TO service_role;
ALTER TABLE public.osint_entity_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read entity index" ON public.osint_entity_index FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage entity index" ON public.osint_entity_index FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE INDEX osint_entity_index_lookup ON public.osint_entity_index(entity_type, entity_id);

-- 6. Knowledge graph edges
CREATE TABLE public.osint_graph_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_entity_type TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  to_entity_type TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  source_record_id UUID REFERENCES public.osint_records(id) ON DELETE SET NULL,
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_entity_type, from_entity_id, relationship, to_entity_type, to_entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_graph_edges TO authenticated;
GRANT ALL ON public.osint_graph_edges TO service_role;
ALTER TABLE public.osint_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read edges" ON public.osint_graph_edges FOR SELECT TO authenticated
  USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage edges" ON public.osint_graph_edges FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE INDEX osint_graph_edges_from ON public.osint_graph_edges(from_entity_type, from_entity_id);
CREATE INDEX osint_graph_edges_to ON public.osint_graph_edges(to_entity_type, to_entity_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.osint_connectors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.osint_sync_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.osint_dead_letters;
