
REVOKE ALL ON FUNCTION public.mibc_dispatch_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mibc_dispatch_tick() TO service_role;

REVOKE ALL ON FUNCTION public.mibc_next_run(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mibc_next_run(text, timestamptz) TO authenticated, service_role;
