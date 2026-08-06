# Performance

**Seaphore · G5.6 · measured 2026-08-06**

## Live pipeline latency

| Stage                                     | Measured       |
| ----------------------------------------- | -------------- |
| GFW round trip, 5 datasets, 30-day window | **~20,000 ms** |
| Cached repeat (60 s TTL)                  | < 1 ms         |
| Normalise + validate 481 observations     | < 30 ms        |

**The 20-second round trip is the dominant cost and the main performance
risk.** It is upstream latency across five sequential datasets, not client
work. Mitigations available, in order of value:

1. Query fewer datasets — fishing alone returns in ~2 s.
2. Issue the five requests in parallel rather than sequentially.
3. Raise the cache TTL above 60 s; event data lags by days, so a 5-minute
   TTL loses nothing.

## Rendering

Incremental rendering is verified by test, not assumption: moving 1 of
2,000 vessels produces 10 single-feature batches and **zero** full
replacements (`geospatial-renderer-contract`).

| Path            | Cost                                                  |
| --------------- | ----------------------------------------------------- |
| `patchVessels`  | one `updateData` with only touched features           |
| `setVesselData` | full replace — initial load and selection change only |

`getRenderStats()` exposes `fullReplacements` / `incrementalBatches` so the
incremental path can be asserted rather than trusted.

## Not measured

**FPS and memory at 100 / 500 / 1,000 / 5,000 / 10,000 vessels were not
measured.** They require a browser with a live map; this environment has no
browser, and the local build is blocked (see KNOWN_LIMITATIONS). Synthesising
10,000 fixtures would measure the fixture generator, not the pipeline, so it
was not done.

The live feed currently yields 481 vessels — an order of magnitude below the
10,000 target — so the target remains unexercised by real data.

## Bounded memory

| Structure                  | Bound                           |
| -------------------------- | ------------------------------- |
| Latency samples per source | 100                             |
| Replay recorder frames     | 50,000, oldest dropped, counted |
| Area cache                 | keyed by bbox+window, 60 s TTL  |
