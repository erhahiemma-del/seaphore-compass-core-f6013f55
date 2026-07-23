
CREATE TABLE IF NOT EXISTS public.osint_source_trust (
  source_id       TEXT NOT NULL,
  field_category  TEXT NOT NULL,
  trust_score     NUMERIC(5,2) NOT NULL CHECK (trust_score >= 0 AND trust_score <= 100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, field_category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osint_source_trust TO authenticated;
GRANT ALL ON public.osint_source_trust TO service_role;
ALTER TABLE public.osint_source_trust ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read source trust" ON public.osint_source_trust
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers manage source trust" ON public.osint_source_trust
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

INSERT INTO public.osint_source_trust (source_id, field_category, trust_score) VALUES
  ('imo-gisis','IDENTITY',100),('imo-gisis','OWNERSHIP',100),('imo-gisis','COMPLIANCE',90),
  ('equasis','IDENTITY',95),('equasis','OWNERSHIP',90),('equasis','COMPLIANCE',85),
  ('marinetraffic','IDENTITY',80),('marinetraffic','POSITION',95),('marinetraffic','VOYAGE',90),
  ('ais','POSITION',90),('ais','VOYAGE',85),
  ('opensanctions','SANCTIONS',95),('opensanctions','OWNERSHIP',70),
  ('customs','CARGO',95),('customs','VOYAGE',80),
  ('nimasa','COMPLIANCE',95),('nimasa','IDENTITY',80),
  ('noaa','WEATHER',95),
  ('gfw','POSITION',80),
  ('trade-atlas','CARGO',80),('trade-atlas','OWNERSHIP',60),
  ('lloyds-list','COMPLIANCE',88),('lloyds-list','OWNERSHIP',75)
ON CONFLICT (source_id, field_category) DO NOTHING;

CREATE TABLE public.ice_queries (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_text    TEXT NOT NULL,
  intent        TEXT,
  entity_hint   JSONB,
  risk_tier     TEXT CHECK (risk_tier IN ('T0','T1','T2','T3')),
  status        TEXT NOT NULL DEFAULT 'PLANNING'
                 CHECK (status IN ('PLANNING','COLLECTING','CORRELATING','FUSING','COMPLETE','FAILED')),
  officer_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_queries TO authenticated;
GRANT ALL ON public.ice_queries TO service_role;
ALTER TABLE public.ice_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice queries" ON public.ice_queries
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice queries" ON public.ice_queries
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TABLE public.ice_query_connectors (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_id        UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL,
  selected        BOOLEAN NOT NULL,
  skipped_reason  TEXT,
  records_fetched INTEGER NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (query_id, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_query_connectors TO authenticated;
GRANT ALL ON public.ice_query_connectors TO service_role;
ALTER TABLE public.ice_query_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice qc" ON public.ice_query_connectors
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice qc" ON public.ice_query_connectors
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TABLE public.ice_correlation_matrix (
  query_id            UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  canonical_id        TEXT NOT NULL,
  field_name          TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  normalized_value    JSONB,
  original_value      JSONB,
  original_unit       TEXT,
  trust_score         NUMERIC(5,2),
  freshness_age_hrs   NUMERIC(10,2),
  freshness_score     NUMERIC(5,2),
  corroboration_score NUMERIC(5,2) DEFAULT 0,
  completeness_score  NUMERIC(5,2) DEFAULT 0,
  quality_score       NUMERIC(5,2) DEFAULT 0,
  evidence_score      NUMERIC(5,2),
  cell_status         TEXT NOT NULL DEFAULT 'SINGLE_SOURCE'
                       CHECK (cell_status IN ('VERIFIED','CORROBORATED','CONFLICT_MAJORITY','CONFLICT_MINORITY','SINGLE_SOURCE','MISSING','NEEDS_REVIEW')),
  tags                TEXT[] NOT NULL DEFAULT '{}',
  retrieved_at        TIMESTAMPTZ NOT NULL,
  raw_hash            TEXT,
  source_url          TEXT,
  PRIMARY KEY (query_id, canonical_id, field_name, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_correlation_matrix TO authenticated;
GRANT ALL ON public.ice_correlation_matrix TO service_role;
ALTER TABLE public.ice_correlation_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice matrix" ON public.ice_correlation_matrix
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice matrix" ON public.ice_correlation_matrix
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE INDEX ice_matrix_field_idx ON public.ice_correlation_matrix(query_id, canonical_id, field_name);

CREATE TABLE public.ice_conflicts (
  id                     UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_id               UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  canonical_id           TEXT NOT NULL,
  field_name             TEXT NOT NULL,
  majority_value         JSONB,
  majority_sources       TEXT[] NOT NULL DEFAULT '{}',
  minority_value         JSONB,
  minority_sources       TEXT[] NOT NULL DEFAULT '{}',
  severity               TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  is_critical_field      BOOLEAN NOT NULL DEFAULT false,
  age_differential_hrs   NUMERIC(10,2),
  resolution             TEXT NOT NULL DEFAULT 'PENDING',
  resolution_reason      TEXT,
  detected_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_conflicts TO authenticated;
GRANT ALL ON public.ice_conflicts TO service_role;
ALTER TABLE public.ice_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice conflicts" ON public.ice_conflicts
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice conflicts" ON public.ice_conflicts
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TABLE public.ice_corroborations (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_id             UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  canonical_id         TEXT NOT NULL,
  field_name           TEXT NOT NULL,
  agreed_value         JSONB NOT NULL,
  agreeing_sources     TEXT[] NOT NULL,
  agreement_count      INTEGER NOT NULL,
  weighted_confidence  NUMERIC(5,2) NOT NULL,
  corroboration_level  TEXT NOT NULL CHECK (corroboration_level IN ('PARTIAL','STRONG','VERIFIED')),
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_corroborations TO authenticated;
GRANT ALL ON public.ice_corroborations TO service_role;
ALTER TABLE public.ice_corroborations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice corr" ON public.ice_corroborations
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice corr" ON public.ice_corroborations
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TABLE public.ice_evidence_scores (
  query_id                UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  canonical_id            TEXT NOT NULL,
  field_name              TEXT NOT NULL,
  source_id               TEXT NOT NULL,
  trust_component         NUMERIC(5,2),
  freshness_component     NUMERIC(5,2),
  corroboration_component NUMERIC(5,2),
  completeness_component  NUMERIC(5,2),
  quality_component       NUMERIC(5,2),
  conflict_penalty        NUMERIC(5,2) NOT NULL DEFAULT 0,
  evidence_score          NUMERIC(5,2) NOT NULL,
  score_breakdown         JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (query_id, canonical_id, field_name, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_evidence_scores TO authenticated;
GRANT ALL ON public.ice_evidence_scores TO service_role;
ALTER TABLE public.ice_evidence_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice scores" ON public.ice_evidence_scores
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice scores" ON public.ice_evidence_scores
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TABLE public.ice_fused_intelligence (
  query_id                 UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  canonical_id             TEXT NOT NULL,
  field_name               TEXT NOT NULL,
  fused_value              JSONB,
  winning_source_id        TEXT,
  winning_evidence_score   NUMERIC(5,2),
  confidence               NUMERIC(5,4) NOT NULL,
  confidence_level         TEXT NOT NULL
                            CHECK (confidence_level IN ('OBSERVED','DECLARED','INFERRED','CORROBORATED','VERIFIED','AUDITED')),
  cell_status              TEXT NOT NULL,
  fusion_policy_version    TEXT NOT NULL DEFAULT 'v1.0',
  has_conflict             BOOLEAN NOT NULL DEFAULT false,
  has_missing_data         BOOLEAN NOT NULL DEFAULT false,
  requires_officer_review  BOOLEAN NOT NULL DEFAULT false,
  explanation_text         TEXT,
  fused_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (query_id, canonical_id, field_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_fused_intelligence TO authenticated;
GRANT ALL ON public.ice_fused_intelligence TO service_role;
ALTER TABLE public.ice_fused_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice fused" ON public.ice_fused_intelligence
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice fused" ON public.ice_fused_intelligence
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE TABLE public.ice_recommendations (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_id          UUID NOT NULL REFERENCES public.ice_queries(id) ON DELETE CASCADE,
  priority          TEXT NOT NULL CHECK (priority IN ('P1','P2','P3','P4','INFO')),
  recommendation    TEXT NOT NULL,
  trigger_condition TEXT NOT NULL,
  trigger_detail    JSONB,
  officer_acted     BOOLEAN NOT NULL DEFAULT false,
  officer_action    TEXT,
  acted_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ice_recommendations TO authenticated;
GRANT ALL ON public.ice_recommendations TO service_role;
ALTER TABLE public.ice_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "officers read ice recs" ON public.ice_recommendations
  FOR SELECT TO authenticated USING (public.is_officer_or_above(auth.uid()));
CREATE POLICY "officers write ice recs" ON public.ice_recommendations
  FOR ALL TO authenticated
  USING (public.is_officer_or_above(auth.uid()))
  WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE INDEX ice_recs_priority_idx ON public.ice_recommendations(query_id, priority);
