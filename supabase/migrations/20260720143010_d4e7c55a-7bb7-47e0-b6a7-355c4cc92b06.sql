
-- 1) data_sources: restrict SELECT to authenticated only (was TO anon)
DROP POLICY IF EXISTS "data_sources readable by all" ON public.data_sources;
CREATE POLICY "data_sources readable by authenticated"
  ON public.data_sources FOR SELECT
  TO authenticated
  USING (true);

-- 2) Storage: require officer+ role in addition to bucket_id check
DROP POLICY IF EXISTS "seaphore buckets read" ON storage.objects;
DROP POLICY IF EXISTS "seaphore buckets write" ON storage.objects;

CREATE POLICY "seaphore buckets read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('evidence','manifests','exports')
    AND public.is_officer_or_above(auth.uid())
  );

CREATE POLICY "seaphore buckets write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('evidence','manifests','exports')
    AND public.is_officer_or_above(auth.uid())
    AND owner = auth.uid()
  );

CREATE POLICY "seaphore buckets update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('evidence','manifests','exports')
    AND public.is_officer_or_above(auth.uid())
    AND owner = auth.uid()
  )
  WITH CHECK (
    bucket_id IN ('evidence','manifests','exports')
    AND public.is_officer_or_above(auth.uid())
    AND owner = auth.uid()
  );

CREATE POLICY "seaphore buckets delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('evidence','manifests','exports')
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR owner = auth.uid())
  );

-- 3) Convert role-check helpers from SECURITY DEFINER to SECURITY INVOKER.
-- The existing "Users read own roles" policy on public.user_roles lets any
-- authenticated caller check their own row, which is all these helpers do
-- (every call site passes auth.uid()). Running as INVOKER removes the
-- privilege-escalation surface flagged by the Supabase linter (0029).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_officer_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('officer'::public.app_role,'director'::public.app_role,'admin'::public.app_role)
  );
$$;
