CREATE TABLE public.provider_credentials (
  provider TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  rotated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rotated_by UUID REFERENCES auth.users,
  last_validated_at TIMESTAMP WITH TIME ZONE
);

REVOKE ALL ON public.provider_credentials FROM anon, authenticated;
GRANT ALL ON public.provider_credentials TO service_role;

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: no browser role can ever read or write this
-- table. Access is exclusively through admin-gated server functions using
-- the privileged server client.