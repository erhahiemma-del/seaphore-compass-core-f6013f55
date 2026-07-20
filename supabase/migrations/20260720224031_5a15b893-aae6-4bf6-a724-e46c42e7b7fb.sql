
INSERT INTO public.osint_connectors (name, description, category, auth_method, endpoint, polling_interval_minutes, rate_limit_per_minute, is_active, health_status, last_sync_status, records_total, last_sync_at)
VALUES ('mock-ais', 'Synthetic AIS feed used to validate the OSINT Integration Engine. Emits two VESSEL records and one intentionally-invalid payload per fetch.', 'AIS', 'none', 'mock://ais', 15, 60, true, 'healthy', 'success', 2, now())
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  auth_method = EXCLUDED.auth_method,
  endpoint = EXCLUDED.endpoint,
  polling_interval_minutes = EXCLUDED.polling_interval_minutes,
  rate_limit_per_minute = EXCLUDED.rate_limit_per_minute;
