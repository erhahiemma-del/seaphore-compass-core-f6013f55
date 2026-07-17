
CREATE TABLE public.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at           timestamptz NOT NULL DEFAULT now(),
  officer_id   uuid NOT NULL,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    text,
  module       text NOT NULL,
  rule_refs    text[] NOT NULL DEFAULT '{}',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address   text NOT NULL
);

CREATE INDEX audit_log_officer_at_idx ON public.audit_log (officer_id, at DESC);
CREATE INDEX audit_log_entity_idx     ON public.audit_log (entity, entity_id);
CREATE INDEX audit_log_module_at_idx  ON public.audit_log (module, at DESC);

-- HR-9: only INSERT and SELECT are granted. UPDATE and DELETE are withheld
-- from every user role so audit entries cannot be modified or removed.
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated officer may append a log entry as themselves.
CREATE POLICY "Officers append their own audit entries"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = officer_id);

-- Officers may read their own entries. Broader read access (compliance/admin)
-- should be added later via a has_role() security-definer function.
CREATE POLICY "Officers read their own audit entries"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = officer_id);

-- No UPDATE policy. No DELETE policy. RLS blocks both by default,
-- and no role has the underlying privileges either.

COMMENT ON TABLE public.audit_log IS
  'HR-9 immutable audit log. Append-only. No user role may update or delete.';
