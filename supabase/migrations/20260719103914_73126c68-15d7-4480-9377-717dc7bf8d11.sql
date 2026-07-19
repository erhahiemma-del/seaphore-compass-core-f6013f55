-- Enable realtime for operational tables so status, timeline, and correlation
-- panels update live across all subscribers.
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER TABLE public.signals REPLICA IDENTITY FULL;
ALTER TABLE public.investigations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'investigations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.investigations;
  END IF;
END $$;