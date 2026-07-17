
-- Retry with corrected format specifiers.

CREATE TYPE public.app_role AS ENUM ('analyst', 'officer', 'director', 'admin');

CREATE TYPE public.confidence_level AS ENUM (
  'OBSERVED','DECLARED','INFERRED','CORROBORATED','VERIFIED','AUDITED'
);

CREATE TYPE public.entity_type AS ENUM (
  'vessel','company','person','voyage','cargo','container','document','port',
  'investigation','evidence','intelligence_report','agency','regulation'
);

CREATE TYPE public.investigation_status AS ENUM (
  'open','active','on_hold','escalated','closed'
);

CREATE TYPE public.voyage_status AS ENUM (
  'planned','in_transit','arrived','discharged','completed','cancelled'
);

-- roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_officer_or_above(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('officer'::public.app_role,'director'::public.app_role,'admin'::public.app_role)
  );
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles"   ON public.user_roles FOR ALL    TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  rank text,
  agency_id uuid,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Officers manage own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Directors/admins read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'admin'));

-- entities / relationships / history
CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.entity_type NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  confidence public.confidence_level NOT NULL DEFAULT 'OBSERVED',
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  risk_score integer CHECK (risk_score BETWEEN 0 AND 100),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id text,
  source_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX entities_type_idx ON public.entities (type);
CREATE INDEX entities_name_idx ON public.entities (name);
CREATE INDEX entities_confidence_idx ON public.entities (confidence);

CREATE TABLE public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  type text NOT NULL,
  confidence public.confidence_level NOT NULL DEFAULT 'OBSERVED',
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (source_id, target_id, type)
);
CREATE INDEX relationships_source_idx ON public.relationships (source_id, type);
CREATE INDEX relationships_target_idx ON public.relationships (target_id, type);

CREATE TABLE public.entity_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  officer_id uuid NOT NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb
);
CREATE INDEX entity_history_entity_at_idx ON public.entity_history (entity_id, at DESC);

GRANT SELECT, INSERT, UPDATE ON public.entities TO authenticated;
GRANT SELECT, INSERT ON public.relationships TO authenticated;
GRANT SELECT, INSERT ON public.entity_history TO authenticated;
GRANT ALL ON public.entities, public.relationships, public.entity_history TO service_role;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any officer reads entities" ON public.entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers+ insert entities" ON public.entities FOR INSERT TO authenticated WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE POLICY "Officers+ update entities" ON public.entities FOR UPDATE TO authenticated USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE POLICY "Admins delete entities"     ON public.entities FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Any officer reads relationships" ON public.relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers+ insert relationships"  ON public.relationships FOR INSERT TO authenticated WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE POLICY "Any officer reads entity history" ON public.entity_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Any officer appends entity history" ON public.entity_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = officer_id);

-- operational tables
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  code text UNIQUE, full_name text NOT NULL, jurisdiction text
);
CREATE TABLE public.ports (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  unlocode text UNIQUE, country text NOT NULL, terminals text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.vessels (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  imo text UNIQUE, mmsi text, call_sign text, flag text
);
CREATE TABLE public.companies (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  cac_number text, lei text, tax_id text, jurisdiction text
);
CREATE TABLE public.persons (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  passport text, role text
);
CREATE TABLE public.voyages (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  voyage_number text UNIQUE,
  vessel_id uuid REFERENCES public.vessels(id),
  origin_port_id uuid REFERENCES public.ports(id),
  destination_port_id uuid REFERENCES public.ports(id),
  eta timestamptz, ata timestamptz, etd timestamptz, atd timestamptz,
  status public.voyage_status NOT NULL DEFAULT 'planned'
);
CREATE TABLE public.manifests (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  voyage_id uuid NOT NULL REFERENCES public.voyages(id) ON DELETE CASCADE,
  submitted_at timestamptz,
  submitted_by_id uuid REFERENCES public.entities(id),
  version integer NOT NULL DEFAULT 1
);
CREATE TABLE public.cargo_items (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  manifest_id uuid NOT NULL REFERENCES public.manifests(id) ON DELETE CASCADE,
  hs_code text, commodity text NOT NULL,
  weight_kg numeric, declared_value numeric, currency text DEFAULT 'USD'
);
CREATE TABLE public.containers (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  container_number text UNIQUE, seal_number text,
  voyage_id uuid REFERENCES public.voyages(id)
);
CREATE TABLE public.documents (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  doc_type text NOT NULL, reference text,
  issued_at timestamptz, issued_by_id uuid REFERENCES public.entities(id),
  voyage_id uuid REFERENCES public.voyages(id), storage_path text
);
CREATE TABLE public.investigations (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  case_number text UNIQUE NOT NULL,
  scenario text,
  status public.investigation_status NOT NULL DEFAULT 'open',
  lead_officer_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  target_voyage_id uuid REFERENCES public.voyages(id)
);
CREATE INDEX investigations_lead_idx ON public.investigations (lead_officer_id);

CREATE TABLE public.evidence (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  investigation_id uuid NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  evidence_type text NOT NULL, source text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  collected_by uuid,
  derived_from_document_id uuid REFERENCES public.documents(id),
  storage_path text
);
CREATE TABLE public.intelligence_reports (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  report_number text UNIQUE NOT NULL,
  classification text NOT NULL DEFAULT 'RESTRICTED',
  investigation_id uuid REFERENCES public.investigations(id),
  issued_by_agency_id uuid REFERENCES public.agencies(id),
  issued_at timestamptz
);
CREATE TABLE public.briefings (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.intelligence_reports(id),
  audience text NOT NULL,
  authorized_by uuid NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  export_envelope jsonb NOT NULL
);
CREATE TABLE public.regulations (
  id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  code text UNIQUE, jurisdiction text, summary text
);

CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at timestamptz NOT NULL DEFAULT now(),
  domain text NOT NULL,
  statement text NOT NULL,
  entity_id uuid REFERENCES public.entities(id),
  confidence public.confidence_level NOT NULL DEFAULT 'OBSERVED',
  severity text NOT NULL DEFAULT 'low',
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX signals_domain_time_idx ON public.signals (domain, observed_at DESC);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raised_at timestamptz NOT NULL DEFAULT now(),
  signal_id uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES public.entities(id),
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  confidence public.confidence_level NOT NULL DEFAULT 'OBSERVED',
  acknowledged_by uuid, acknowledged_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence public.confidence_level NOT NULL DEFAULT 'INFERRED',
  computed_at timestamptz NOT NULL DEFAULT now(),
  inputs jsonb NOT NULL,
  model text NOT NULL
);
CREATE INDEX risk_scores_entity_time_idx ON public.risk_scores (entity_id, computed_at DESC);

GRANT SELECT, INSERT, UPDATE ON
  public.agencies, public.ports, public.vessels, public.companies, public.persons,
  public.voyages, public.manifests, public.cargo_items, public.containers,
  public.documents, public.investigations, public.evidence,
  public.intelligence_reports, public.briefings, public.regulations,
  public.signals, public.alerts, public.risk_scores
TO authenticated;

GRANT ALL ON
  public.agencies, public.ports, public.vessels, public.companies, public.persons,
  public.voyages, public.manifests, public.cargo_items, public.containers,
  public.documents, public.investigations, public.evidence,
  public.intelligence_reports, public.briefings, public.regulations,
  public.signals, public.alerts, public.risk_scores
TO service_role;

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voyages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agencies','ports','vessels','companies','persons','voyages','manifests',
    'cargo_items','containers','documents','intelligence_reports','briefings',
    'regulations','signals','alerts','risk_scores'
  ] LOOP
    EXECUTE format('CREATE POLICY "Any officer reads %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('CREATE POLICY "Officers+ insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_officer_or_above(auth.uid()));', t);
    EXECUTE format('CREATE POLICY "Officers+ update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));', t);
  END LOOP;
END$$;

CREATE POLICY "Read investigations" ON public.investigations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Analysts create own investigations" ON public.investigations FOR INSERT TO authenticated
  WITH CHECK (
    lead_officer_id = auth.uid()
    AND (public.has_role(auth.uid(),'analyst') OR public.is_officer_or_above(auth.uid()))
  );
CREATE POLICY "Analysts update own open investigations" ON public.investigations FOR UPDATE TO authenticated
  USING (lead_officer_id = auth.uid() AND status <> 'closed' AND public.has_role(auth.uid(),'analyst'))
  WITH CHECK (lead_officer_id = auth.uid() AND status <> 'closed');
CREATE POLICY "Officers+ update non-closed investigations" ON public.investigations FOR UPDATE TO authenticated
  USING (public.is_officer_or_above(auth.uid()) AND (status <> 'closed' OR public.has_role(auth.uid(),'admin')))
  WITH CHECK (public.is_officer_or_above(auth.uid()));

CREATE POLICY "Read evidence" ON public.evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Analysts add evidence to own cases" ON public.evidence FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.investigations i WHERE i.id = investigation_id AND i.lead_officer_id = auth.uid()));
CREATE POLICY "Officers+ insert evidence" ON public.evidence FOR INSERT TO authenticated WITH CHECK (public.is_officer_or_above(auth.uid()));
CREATE POLICY "Officers+ update evidence" ON public.evidence FOR UPDATE TO authenticated
  USING (public.is_officer_or_above(auth.uid())) WITH CHECK (public.is_officer_or_above(auth.uid()));
-- No DELETE policy on evidence.

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER entities_touch BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- HR-6 vessel-name guard
CREATE OR REPLACE FUNCTION public.assert_neutral_vessel_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  banned text[] := ARRAY['fraudster','criminal','smuggler','pirate','thief','villain','outlaw','convict','felon','crook','scam','illicit','guilty'];
  token text;
BEGIN
  IF NEW.type = 'vessel' THEN
    FOREACH token IN ARRAY banned LOOP
      IF position(token IN lower(NEW.name)) > 0 THEN
        RAISE EXCEPTION '[HR-6] Vessel name % implies guilt; use a neutral synthetic name', NEW.name;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER entities_vessel_name_guard BEFORE INSERT OR UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.assert_neutral_vessel_name();

-- HR-2 VERIFIED requires source
CREATE OR REPLACE FUNCTION public.assert_verified_has_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.confidence = 'VERIFIED' THEN
    IF NEW.source_id IS NULL OR length(coalesce(NEW.source_name,'')) = 0 THEN
      RAISE EXCEPTION '[HR-2] VERIFIED confidence requires source_id and source_name';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER entities_verified_source_guard BEFORE INSERT OR UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.assert_verified_has_source();
