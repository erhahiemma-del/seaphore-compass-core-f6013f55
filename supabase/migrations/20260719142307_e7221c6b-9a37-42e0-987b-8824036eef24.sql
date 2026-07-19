
DROP POLICY IF EXISTS "auth append orch events" ON public.orchestration_events;
CREATE POLICY "auth append orch events" ON public.orchestration_events
  FOR INSERT TO authenticated
  WITH CHECK (emitted_by IS NULL OR emitted_by = auth.uid());

CREATE OR REPLACE FUNCTION public.block_override_mutation() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS
$$ BEGIN RAISE EXCEPTION '[HR-9] briefing_overrides are immutable'; END $$;

CREATE OR REPLACE FUNCTION public.block_event_mutation() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS
$$ BEGIN RAISE EXCEPTION 'orchestration_events are append-only'; END $$;
