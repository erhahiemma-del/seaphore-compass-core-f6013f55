# AIS Provider Activation Checklist

**Both providers are `PENDING_CREDENTIALS`. This is the expected state,
not a failure.**

Seaphore's AIS layer is provider-agnostic: the correlation engine
consumes `AisReport[]` and has never seen a provider-specific type.
Activating a provider is implementing one interface and calling
`registerAisProvider()`. Nothing else changes.

---

## Why no provider code has been written

The repository contains **no Datalastic API documentation and no
credential**. The only endpoint referenced anywhere is a `/ping`
healthcheck in the existing stub adapter.

Writing endpoints from memory would produce code that compiles, passes
tests written against the same guesses, and fails on first contact with
the real API — while looking finished. The stub returning an honest empty
envelope is more useful than a plausible fiction.

---

## Datalastic

### Blockers

| #   | Item                          | Status                                                              |
| --- | ----------------------------- | ------------------------------------------------------------------- |
| 1   | API credentials               | ❌ Not provisioned. `DATALASTIC_API_KEY` absent from `.env.example` |
| 2   | Official API documentation    | ❌ Not supplied to the repository                                   |
| 3   | Endpoint verification         | ❌ Unverified                                                       |
| 4   | Rate limits                   | ❌ Unverified                                                       |
| 5   | Plan / credits                | ❌ Unknown                                                          |
| 6   | Historical access             | ❌ Unverified                                                       |
| 7   | Area / fleet query capability | ❌ Unverified — **the capability SAR correlation depends on**       |
| 8   | Timestamp semantics           | ❌ Unverified                                                       |
| 9   | Commercial licensing          | ❌ Unread                                                           |

### The two that matter most

**Area query (7).** SAR correlation asks "what was in this bounding box
during this window?". A provider that only answers "where is vessel X
now?" cannot serve it — we would have to know the answer before asking.
If Datalastic offers only per-vessel lookup, the correlation strategy
must change, not just the adapter.

**Timestamp semantics (8).** Does the returned timestamp mean _the vessel
transmitted_ or _we received it_? Satellite AIS can lag transmission by
minutes to hours. Getting this backwards shifts every correlation by that
lag and silently degrades every candidate score. `AisReport` keeps
`reportedAt` and `receivedAt` separate so the answer can be recorded
rather than assumed.

### Existing asset

`src/adapters/ais/datalastic.adapter.ts` is an honest stub returning an
empty, degraded envelope. **Complete it; do not replace it.**

---

## SeaVantage

Reserved slot. No adapter exists, and per instruction none will be
written until documentation and access are supplied.

| #   | Item                                                                  | Status            |
| --- | --------------------------------------------------------------------- | ----------------- |
| 1   | API credentials                                                       | ❌                |
| 2   | Official API documentation                                            | ❌                |
| 3–9 | Endpoints, rate limits, historical, area query, timestamps, licensing | ❌ All unverified |

---

## Activation procedure

Identical for both providers.

### 1. Record the contract

Add the verified endpoint, parameters, response shape and timestamp
semantics to this document. Verified means _observed in a real response_,
not read in a sales page.

### 2. Implement `AisHistoryProvider`

```ts
interface AisHistoryProvider {
  readonly providerId: string;
  covers(bbox, fromMs, toMs): boolean;
  query(bbox, fromMs, toMs): Promise<readonly AisReport[]>;
}
```

`covers()` is not a formality. It is how the provider declares it was
_able_ to see, which is the sole basis on which its silence may be read
as `unmatched` rather than `no-ais-coverage`. **A provider that returns
`true` unconditionally breaks the most important guarantee in the
pipeline.** If coverage limits are unknown, return `false` outside the
region the plan is verified to cover.

### 3. Keep the key server-side

Read the credential inside the execution boundary of a `.server.ts`
module, per `gfw.server.ts` and `eo.server.ts`. It must never reach a
client bundle.

### 4. Normalise to `AisReport`

Map into the canonical shape — no provider types past the adapter. Keep
`reportedAt` and `receivedAt` distinct, and record `sourceRecordId` for
citation.

### 5. Register and activate

```ts
aisProviderRegistry.activate("datalastic", new DatalasticHistoryProvider());
registerAisHistoryProvider(provider);
```

Status flips to `CONNECTED`. Correlation, classification, the map and
Copilot begin working with no change to any of them.

### 6. Verify before trusting

- A known vessel at a known time returns the expected position
- An area with no traffic returns zero reports **and** `covers() === true`
- An area outside plan coverage returns `covers() === false`
- Timestamps match the documented semantics

---

## Two providers, one picture

When both are active they will disagree — different positions, timestamps
and destinations for the same vessel. That is expected.

Both observations are retained. Neither is privileged in code, and the
evidence layer determines agreement, conflict and staleness. The
correlator scores each independently, exactly as it does today with a
single source, so adding the second provider requires no correlation
change.

---

## Current state

```
Datalastic   PENDING_CREDENTIALS   9 blockers
SeaVantage   PENDING_CREDENTIALS   reserved slot
AIS coverage NONE
```

Every SAR correlation therefore returns `no-ais-coverage`, and the
pipeline states that this reflects Seaphore's collection rather than the
absence of vessels. That is the correct output for a system with no AIS
provider, and it is enforced structurally — `supportsUnmatchedConclusion()`
requires a provider that both ran and declared coverage.
