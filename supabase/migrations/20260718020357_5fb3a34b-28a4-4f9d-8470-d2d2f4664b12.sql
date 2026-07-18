
-- PERM-1: Align RLS with Seaphore Permissions Matrix (Part E)

-- Briefings: all roles can create, but OFFICIAL-SENSITIVE audience requires Officer+
DROP POLICY IF EXISTS "Officers+ insert briefings" ON public.briefings;
CREATE POLICY "All authenticated create briefings"
  ON public.briefings FOR INSERT TO authenticated
  WITH CHECK (
    authorized_by = auth.uid()
    AND (
      is_officer_or_above(auth.uid())
      OR upper(coalesce(audience, '')) NOT LIKE '%OFFICIAL-SENSITIVE%'
    )
  );

-- Evidence: Admin-only DELETE (PERM matrix: Delete evidence = Admin only)
DROP POLICY IF EXISTS "Admins delete evidence" ON public.evidence;
CREATE POLICY "Admins delete evidence"
  ON public.evidence FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Audit log read scoping: officer sees team (their led investigations), director/admin sees all
DROP POLICY IF EXISTS "Directors and admins read all audit entries" ON public.audit_log;
CREATE POLICY "Directors and admins read all audit entries"
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'director'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Officers read team audit entries" ON public.audit_log;
CREATE POLICY "Officers read team audit entries"
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'officer'::public.app_role)
    AND entity = 'investigation'
    AND entity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.investigations i
      WHERE i.id::text = audit_log.entity_id
        AND i.lead_officer_id = auth.uid()
    )
  );

-- Profiles: Admin-only user management (in addition to self-management already present)
DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- PERM-2 / PERM-3: reassert immutability triggers exist (no-ops if already present)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_update') THEN
    CREATE TRIGGER audit_log_no_update
      BEFORE UPDATE OR DELETE ON public.audit_log
      FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'decisions_no_update') THEN
    CREATE TRIGGER decisions_no_update
      BEFORE UPDATE OR DELETE ON public.decisions
      FOR EACH ROW EXECUTE FUNCTION public.block_decision_mutation();
  END IF;
END $$;
