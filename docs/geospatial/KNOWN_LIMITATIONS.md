# Known Limitations

**Seaphore · G5.6 · 2026-08-06**

Stated plainly so none of these is discovered later as a surprise.

---

## Data

### GFW is an activity feed, not live AIS

The map shows vessels that produced an **AIS-derived event** in the area
during the window, at that event's position. It is not real-time traffic and
must never be presented as one. GFW publishes no "all vessels currently
transmitting" endpoint.

### Observations are days to years old

A 24-hour window returns **zero** events. The default window is 30 days, and
port-visit events can legitimately start years ago and still be a vessel's
latest known position. Every observation is banded by freshness — most show
**Stale** — which is truthful. Validation's 7-day age rejection is relaxed
for this source only; rejecting old events emptied the map entirely.

### No IMO

GFW carries `ssvid` (MMSI), not IMO. Identity keys fall back
IMO → MMSI → GFW vessel id. Cross-provider identity matching will therefore
be weaker until a registry source (IMO GISIS, Equasis) is joined in.

### No speed or course

Neither is present on GFW events. Both default to **0** and are never
invented, so every vessel arrow currently points north. This is a data
absence, not a rendering bug.

### Confidence is fixed at 0.60

GFW is graded `aggregated`, giving every observation 0.60 / `INFERRED`.
Confidence will only differentiate once a second provider allows the fusion
model's corroboration rule to apply.

---

## Coverage

| Item                               | Status                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| Vessels rendered in a browser      | **Not visually confirmed** — no browser in this environment |
| FPS / memory at 100–10,000 vessels | **Not measured** — needs a browser                          |
| 10,000-vessel target               | Unexercised; the live feed yields 481                       |
| Replay against live data           | Recorder is not yet fed by the live path                    |
| Lovable deployment                 | **Not verified** — no access from here                      |

---

## Environment

### The local build and test runner are broken on Windows

`@lovable.dev/mcp-js` compares a forward-slash root against a Windows
backslash path:

```
routesDir "src/routes" must resolve under C:/Projects/seaphore,
got C:\Projects\seaphore\src\routes
```

This blocks **both** `bun run build` and `bun run test:unit` on Windows. It
is pre-existing and unrelated to the geospatial work. On Linux both paths use
`/`, so CI and Lovable are unaffected. All 279 tests in this session ran
through a temporary config that bypasses the plugin.

### `bun run typecheck` does not work locally

The script calls `tsgo`, which is not a dependency. CI works because `bunx`
fetches it. Verification used the installed `tsc`.

### Pre-existing baseline

177 typecheck errors and ~91 lint errors exist on `main` and were not
introduced here. Every gate in this sprint held at exactly that baseline.

---

## Security

### `.env` is tracked by git and not gitignored

The GFW token is in the working tree only and **has not been committed**.
But `.env` is a tracked file, so a single `git add .env` or `git add -A` at
the repository root would publish the token.

The committed `.env` contains only Supabase URL, project id and the
**publishable** key — no service-role key, no real secret.

**Recommended, requires your decision:** `git rm --cached .env` and add
`.env` to `.gitignore`. Not done unilaterally because the Lovable build may
read the committed file, and removing it could break the deployment. If the
token has ever been staged, rotate it.
