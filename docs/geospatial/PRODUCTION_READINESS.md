# Production Readiness — G5.6

**Seaphore · Live Command Map · 2026-08-06**

Status: **conditionally ready**. The pipeline is verified end-to-end against
the live provider. Three items below require action before production use.

---

## Completed

| Capability                             | Verified how                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| MapLibre renderer, incremental updates | Unit-tested; 1-of-2,000 move → 10 single-feature batches, 0 full replacements |
| GFW live integration                   | **481 real vessels** retrieved for the Gulf of Guinea                         |
| Normalisation                          | Real GFW entries → canonical `Vessel`; live-verified                          |
| Validation                             | accepted / warning / rejected with reason codes; 8 rejected of 489 live       |
| Freshness                              | Five bands, configurable thresholds, shared by map and providers              |
| Diagnostics                            | Latency, success rate, requests, cache state, last sync — rendered in-browser |
| Sources panel                          | Rendered in-browser; provider-agnostic (names nothing)                        |
| Dashboard                              | Rendered in-browser: providers, healthy, vessels, confidence, freshness       |
| Replay                                 | Recorder wired to the live path; consumes the same validated observations     |
| Fleet summary                          | `summarizeFleet` / `describeFleet` for Copilot and briefings                  |
| Fusion model                           | Multi-provider corroboration, citations, conflicts                            |
| Secret hygiene                         | `.env` untracked and gitignored; token never committed                        |

**288 tests, 14 suites, 0 regressions. Typecheck at the 177 pre-existing baseline.**

---

## Environment variables

| Variable          | Scope           | Notes                                                                   |
| ----------------- | --------------- | ----------------------------------------------------------------------- |
| `GFW_API_TOKEN`   | **Server only** | Never `VITE_`-prefixed — that publishes the secret in the client bundle |
| `SUPABASE_*`      | Server          |                                                                         |
| `VITE_SUPABASE_*` | Client          | Publishable values only                                                 |

**Local:** copy `.env.example` → `.env`, fill in. `.env` is gitignored and
must never be committed.

**Deployment:** `.env` is no longer tracked, so Lovable will **not** receive
it from the repository. Set `GFW_API_TOKEN` in Lovable's environment
settings before deploying, or the map will render its "No credentials" state.

---

## Remaining limitations

1. **Vessels not yet seen rendering in a browser.** The panels, controls and
   diagnostics were verified live; the vessel markers were not, because the
   dev server's outbound fetch to GFW fails in the verification sandbox
   (`Provider Unreachable — fetch failed`). The same call succeeds from
   `bun`. Environmental, not a code defect.
2. **Copilot binding is partial.** `describeFleet()` produces the summary,
   but it is not yet injected into `askCopilot`'s prompt context — that
   requires confirming that function's contract.
3. **Replay has no UI.** Recorder and player are wired and tested; no
   timeline surface exists. `MapCanvas` exposes `onRecorderReady` so one can
   attach without new plumbing.
4. **GFW is an activity feed, not live AIS.** Event-derived positions, days
   to years old. No IMO, no course, no speed — every arrow points north.
   Confidence is fixed at 0.60.
5. **FPS/memory unmeasured** at 100–10,000 vessels. The live feed yields 481.
6. **Windows local build and tests are blocked.** See below.

---

## Known external dependencies

### `@lovable.dev/mcp-js` — Windows path bug (upstream, not fixable here)

```js
function normalizePath(p) { return p.split(sep).join("/"); }  // parent → forward slashes
function assertContains(parent, child) {
  if (child !== parent && !child.startsWith(parent + sep)) throw …  // child → backslashes
}
```

The parent is normalised to forward slashes; the child from `resolve()` is
not; they are then compared using the native separator. On Windows this
always throws. **No `routesDir` option can fix it** — `resolve()` returns
backslashes regardless.

Blocks `bun run dev`, `bun run build`, `bun run test:unit` on Windows.
Linux/CI/Lovable unaffected (both paths use `/`).

**Workaround** — local verification only, never commit:

```bash
# vite.verify.tmp.config.ts — the real config minus mcpPlugin()
bun run vite dev --config vite.verify.tmp.config.ts --port 5199
```

**Fix upstream:** normalise `child` in `assertContains`, or compare with `/`.

### Other

- `bun run typecheck` calls `tsgo`, not a dependency. Use `tsc`.
- 177 typecheck errors and ~91 lint errors pre-exist on `main`.
- GFW free tier; 5-dataset query takes ~20 s.

---

## Deployment checklist

1. ⬜ Set `GFW_API_TOKEN` in Lovable environment settings (**required** —
   `.env` is no longer in the repo).
2. ⬜ Confirm it is **not** `VITE_`-prefixed.
3. ⬜ Rotate the token if it was ever staged in git.
4. ⬜ Verify CI build passes on Linux.
5. ⬜ Confirm `.env` is absent from the deployed bundle.
6. ⬜ Decide the dataset set — five datasets cost ~20 s; fishing alone ~2 s.
7. ⬜ Consider raising the 60 s cache TTL; GFW data lags by days.

## Manual verification checklist

Open `/maritime` on the deployment.

**Sources panel**

1. ⬜ Reads `1/1 on`, GFW enabled, `Disabled 0`.
2. ⬜ Status moves Idle → **Live** within ~20 s.
3. ⬜ Records ≈ 481; Confidence 60%; Latency populated; Last sync set.
4. ⬜ Caveat text visible: "Event-derived positions, not a continuous live feed".

**Map** 5. ⬜ Dark CARTO basemap renders. 6. ⬜ Gold dashed EEZ boundary; five port diamonds (APA/TIN/WAR/CAL/ONN). 7. ⬜ Vessel arrows appear. _Expect all pointing north and mostly dimmed —
GFW reports no course, and observations are old. Both are correct._ 8. ⬜ Status bar vessel count matches the Sources record count.

**Interaction** 9. ⬜ Hover ~500 ms → popup with name, IMO, risk, freshness band + age. 10. ⬜ Click → marker turns teal, Intelligence Card opens. 11. ⬜ Card shows real name/MMSI/flag/position; Owner/Operator/Confidence
state _why_ they are unavailable rather than being blank. 12. ⬜ Click empty sea → deselects.

**Layers** 13. ⬜ Toggle Vessels off → arrows, labels and headings all disappear. 14. ⬜ Opacity slider visibly fades the layer; URL gains `opacity=`. 15. ⬜ Preset "Revenue Investigation" activates the four expected layers. 16. ⬜ Copy URL → new tab → camera, layers, opacity and sources all restore.

**Performance** 17. ⬜ DevTools: FPS while panning with ~481 vessels. 18. ⬜ Memory stable over 5 minutes.
