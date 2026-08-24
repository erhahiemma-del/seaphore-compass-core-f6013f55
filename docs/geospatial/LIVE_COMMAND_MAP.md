# Live Command Map

**Seaphore · GIP G5.5.2 · canonical**

`/maritime` is the primary operational workspace. It is not a vessel tracker —
it is a **Maritime Common Operating Picture**: an intelligence canvas that
surfaces what deserves attention, explains why, and offers the next action.

**Every element must answer at least one of:**

1. What needs my attention?
2. Why does it matter?
3. What should I do next?

An element that answers none of the three does not ship.

---

## Screen layout

| Zone                     | Size         | Content                                          | Status                                    |
| ------------------------ | ------------ | ------------------------------------------------ | ----------------------------------------- |
| Header                   | full         | Title, command toolbar, view toggle              | IMPLEMENTED                               |
| Map canvas               | flex         | MapLibre 2D Operational View                     | IMPLEMENTED                               |
| Intelligence card        | 320 px       | Selected vessel, slides in on click              | IMPLEMENTED                               |
| Layer panel              | 288 px       | Mission-grouped layers, search, opacity, presets | IMPLEMENTED                               |
| Status bar               | full × 24 px | Vessels, layers, FPS, renderer state             | IMPLEMENTED                               |
| National Situation Layer | full × 32 px | KPI bar                                          | SPECIFIED — needs OSAE                    |
| Priority Queue           | 240 px       | Ranked attention vessels                         | SPECIFIED — needs OSAE                    |
| Filter panel             | 200 px       | Risk / type / destination / arrival              | SPECIFIED — SGS state exists, UI does not |
| Timeline bar             | full × 48 px | AIS replay scrubber                              | SPECIFIED — SGS state exists, UI does not |

---

## Command toolbar

| Control          | Behaviour                                         | Status                                 |
| ---------------- | ------------------------------------------------- | -------------------------------------- |
| Zoom in / out    | `sgs.setCamera({ zoom ± 1 })`, clamped to min/max | IMPLEMENTED                            |
| Locate Nigeria   | Centres `[5.7, 4.35]` at zoom 6                   | IMPLEMENTED                            |
| Fit to selection | Centres the selected vessel at zoom 10            | IMPLEMENTED                            |
| Clear selection  | `sgs.clearSelection()`                            | IMPLEMENTED                            |
| Reset view       | `sgs.reset()` — full default state                | IMPLEMENTED                            |
| Fullscreen       | Fullscreen API on the shell                       | IMPLEMENTED                            |
| Measure distance | —                                                 | **Disabled with a reason**, not hidden |
| Screenshot       | —                                                 | **Disabled with a reason**, not hidden |

Every action writes to SGS rather than reaching into the renderer, so the camera
has one owner and the URL stays in step.

---

## Selection

1. Officer clicks a vessel.
2. `MapLibreRenderer` emits `vessel:click` on the event bus.
3. `MapCanvas` calls `sgs.selectEntity(imo, imo)` and looks the vessel up from
   the update engine.
4. SGS notifies subscribers; the marker switches to the `vessel-selected` sprite.
5. The Intelligence Card renders.

Clicking bare basemap deselects — verified with `queryRenderedFeatures` so a
click that lands on a vessel is never treated as a deselect.

**Only one vessel is selected at a time.** Selection _identity_ lives in SGS;
the vessel _data object_ is looked up on demand, never copied into a second
store.

---

## Intelligence card

Shows Identity (name, IMO, MMSI, call sign, flag, type), Ownership (owner,
operator), Position (coordinates, heading, speed, destination, ETA, last AIS),
and Assessment (risk, attention score, confidence).

**Every field renders.** A field with no data shows why — "Not in current AIS
report", "Requires vessel registry lookup", "Awaiting ownership intelligence" —
rather than being hidden. An officer must be able to tell _"this vessel has no
registered owner on file"_ from _"we forgot to display the owner"_. Nothing is
fabricated.

Action buttons (Investigation, Entity, Timeline, Copilot) are present and
disabled until their handlers are wired.

---

## URL state

`/maritime?view=2D&lat=4.5000&lon=3.5000&zoom=6.0&layers=vessels,ports,eezBoundary`

Serialised: view mode, centre, zoom, active layers, layer opacity (sparse),
selected vessel IMO, mission id.

Hydration is defensive — every field is validated and silently skipped when
malformed. A truncated or hand-edited link degrades to a usable map, never an
exception. Out-of-range coordinates are rejected; zoom is clamped; unknown
layer keys are dropped. An explicitly empty `layers=` means "hide everything"
and is honoured; a list of entirely unknown keys is ignored.

---

## Empty and degraded states

Never a blank map. Each state explains itself:

| State                   | Message                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| No rendering engine     | "Rendering engine unavailable — the geospatial foundation is active. This is not a data outage." |
| No vessel source        | Map renders basemap, EEZ and ports; status bar reads `0 vessels`                                 |
| Basemap unreachable     | Automatic fallback to Stadia Alidade Smooth Dark, `map:error` emitted                            |
| Layer with no connector | "No source" badge plus the specific reason                                                       |
| Field with no data      | The reason, in place of the value                                                                |

---

## Accessibility

- Toolbar is a labelled `role="toolbar"`; every control has `aria-label` and a
  visible focus ring.
- View toggle uses `aria-pressed`.
- Layer switches are labelled and described by their description text.
- Opacity uses a native `<input type="range">` — keyboard-operable and
  screen-reader labelled without an extra dependency.
- Layer panel is `<aside aria-label="Map layers">`; the card is labelled with
  the vessel name.
- Colour is never the sole carrier of meaning: ports are a _diamond_, vessels an
  _arrow_, and risk is stated in text on the card.

---

_Seaphore · Rhahi Technologies Ltd. · Confidential_
