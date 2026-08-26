-- M2.8 — register SeaVantage and Trade Atlas in the Data Source Matrix.
--
-- `src/adapters/matrix.ts` declares itself "a client-safe mirror of
-- public.data_sources", and M2.8 added these two providers to that
-- constant. Without this migration the mirror and the table disagree:
-- the UI would fall back to the constant for citation metadata while
-- `useDataSources()` found no row to render a status chip from, and an
-- administrator would have no row to override.
--
-- Both are PLANNED. Their adapters (`ais/seavantage.adapter.ts`,
-- `trade/trade-atlas.adapter.ts`) throw PlannedSourceError rather than
-- returning an empty result, so neither can be mistaken for a connected
-- source. No credentials are introduced here or anywhere else in M2.8.
--
-- Trade Atlas sits alongside Volza rather than replacing it. Both are
-- `trade` kind and both may contribute evidence for the same claim;
-- which wins a contradiction is decided per-claim in the fusion layer,
-- where they are weighted equally. Neither is primary.

INSERT INTO public.data_sources (id, data_type, provider, status, kind, default_confidence, citation, scope, notes) VALUES
 ('seavantage',  'AIS positions and historical vessel tracks',                'SeaVantage',  'PLANNED', 'ais_history', 'OBSERVED',     'SeaVantage vessel tracking platform',            'commercial', 'Registered in services/eo/ais-providers.ts as PENDING_CREDENTIALS. No adapter implementation; awaiting credentials and API documentation.'),
 ('trade_atlas', 'Trade intelligence (import/export flows, trade relationships)', 'Trade Atlas', 'PLANNED', 'trade',       'CORROBORATED', 'Trade Atlas global trade intelligence dataset', 'commercial', 'Infrastructure registered in M2.8; no credentials and no adapter implementation. Coexists with Volza as an independent trade source — neither is primary.')
ON CONFLICT (id) DO NOTHING;
