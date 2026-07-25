ALTER TABLE public.intel_briefings ADD COLUMN IF NOT EXISTS source_uip_id text;
CREATE INDEX IF NOT EXISTS intel_briefings_source_uip_id_idx ON public.intel_briefings(source_uip_id);