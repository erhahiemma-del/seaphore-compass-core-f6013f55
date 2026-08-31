CREATE TABLE public.officer_map_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terrain_3d boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.officer_map_preferences TO authenticated;
GRANT ALL ON public.officer_map_preferences TO service_role;

ALTER TABLE public.officer_map_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers manage their own map preferences"
  ON public.officer_map_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER officer_map_preferences_touch
  BEFORE UPDATE ON public.officer_map_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();