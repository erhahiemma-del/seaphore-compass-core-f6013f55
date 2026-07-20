# Seaphore OSINT Connector Template

This folder is the canonical pattern every OSINT connector must follow.
Copy it to `src/connectors/<your-source>/` and work through the checklist
below. The engine (registry, scheduler, retry, DLQ, health monitor,
graph writer) is source-agnostic — as long as your connector honours
the contract in `src/lib/osint/types.ts`, it will run.

## Implementation checklist

Copy the folder:

```bash
cp -r src/connectors/_template src/connectors/<your-source>
```

Then, in the new folder:

- [ ] **SECTION 1 — Metadata**
  - [ ] Rename the class to `<SourceName>Connector`
  - [ ] Set a unique, stable `name` (this becomes `source_id` on every record)
  - [ ] Write a one-sentence `description`
  - [ ] Pick the correct `category`, `authMethod`, `endpoint`
  - [ ] Set `pollingIntervalMinutes` from the source's freshness SLA
  - [ ] Set `rateLimitPerMinute` from the provider's published limit
  - [ ] Pick the honest `provenance` grade (government / commercial_verified / aggregated / scraped)

- [ ] **SECTION 2 — Authentication**
  - [ ] Rename the env var (e.g. `<SOURCE>_API_KEY`) and register it via `add_secret`
  - [ ] Use the header format the provider actually expects
  - [ ] Confirm `AuthError` is thrown when the env var is missing

- [ ] **SECTION 3 — Fetch**
  - [ ] Implement the source's real pagination shape
  - [ ] Map the source's envelope to the `{ items, next_cursor }` extraction
  - [ ] Attach a stable `sourceRef` to every item (this is the dedupe key)
  - [ ] Verify 429 raises `RateLimitError` and 401/403 raise `AuthError`

- [ ] **SECTION 4 — Normalize**
  - [ ] Map every field your app will read into `data`
  - [ ] Set the correct `entityType` and `entityId`
  - [ ] Preserve the raw payload verbatim on `rawData`
  - [ ] Confirm `normalize()` never throws — malformed input returns an
        empty-entityId record so the pipeline routes it to the DLQ

- [ ] **SECTION 5 — Ingest**
  - [ ] Leave the shared pipeline call in place (do not reimplement upsert)

- [ ] **SECTION 6 — Knowledge graph mapping**
  - [ ] Emit only relationships your source actually supports
  - [ ] Use the canonical relationship names where they apply
        (`VESSEL_OWNED_BY`, `VESSEL_MANAGED_BY`, `VESSEL_FLAGGED_IN`,
        `VESSEL_CALLED_AT`, `VESSEL_UNDER_SANCTION`)

- [ ] **SECTION 7 — Health check**
  - [ ] Point the probe at a cheap endpoint (HEAD or a small GET)
  - [ ] Confirm it returns within 5 seconds

- [ ] **SECTION 8 — Tests**
  - [ ] Replace `VALID_FIXTURE` with a real payload from the source
  - [ ] Keep the four required cases: valid normalize, malformed normalize,
        healthCheck shape, graph edges

- [ ] **Registration**
  - [ ] Import your connector in `src/lib/osint/connectors/index.ts`
  - [ ] Call `registerConnector(<yourConnector>)`
  - [ ] Open `/admin/osint` — your source should appear in the table

## What the engine does for you

You do not implement any of these — they live in `src/lib/osint/`:

- **Registry** — mirrors the connector to the `osint_connectors` row
- **Scheduler** — fires `fetch()` on your polling interval, per-connector concurrency lock
- **Retry** — exponential backoff (1, 5, 15, 60, 240 min), max 5 attempts, then DLQ
- **Rate limits** — 429 responses trigger cool-down instead of retry
- **Ingestion pipeline** — validates every SeaphoreRecord, upserts on `(source_id, source_ref)`, preserves `rawData`
- **Entity index** — populates `osint_entity_index` after each upsert
- **Dead-letter queue** — captures failed records with the raw payload for later retry from the dashboard
- **Health monitor** — recomputes `health_status` from run history after every sync
- **Graph writer** — collects `mapToGraph()` output across the batch and upserts into `osint_graph_edges`
- **Dashboard** — `/admin/osint` renders your connector with live realtime updates

## Contract summary

Every connector MUST:

1. Export a value that implements `ConnectorInterface` from `@/lib/osint/types`.
2. Read credentials only from `process.env` — never hardcode a key.
3. Throw `NetworkError | RateLimitError | AuthError | ParseError` from `fetch()`.
4. Return `null`-equivalent (empty `entityId`) from `normalize()` on malformed input, never throw.
5. Delegate persistence to the shared ingestion pipeline in `ingest()`.
6. Ship an `index.test.ts` covering the four required cases.
