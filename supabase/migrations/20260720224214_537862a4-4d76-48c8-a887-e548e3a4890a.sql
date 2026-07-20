
GRANT SELECT ON public.osint_connectors TO anon;
GRANT SELECT ON public.osint_sync_runs TO anon;
GRANT SELECT ON public.osint_dead_letters TO anon;

CREATE POLICY "public read connector registry" ON public.osint_connectors FOR SELECT TO anon USING (true);
CREATE POLICY "public read sync runs" ON public.osint_sync_runs FOR SELECT TO anon USING (true);
CREATE POLICY "public read dead letters" ON public.osint_dead_letters FOR SELECT TO anon USING (true);
