import { createFileRoute } from "@tanstack/react-router";

import { MaritimeCommand } from "@/features/maritime/MaritimeCommand";
import {
  defaultEnabledSourceIds,
  registerGlobalFishingWatchSource,
  sgs,
} from "@/services/geospatial";
import { registerSimulatedVesselSource } from "@/services/geospatial/sources/simulated-vessel-source";
import { registerDatalasticSource } from "@/services/geospatial/sources/datalastic-vessel-source";
import { registerNpaAugmentedSource } from "@/services/geospatial/sources/npa-augmented-source";
import { registerConnectedProviders } from "@/services/intelligence-layer";
import { loadEezRing } from "@/services/geospatial/eez-ring";

// Register the live provider once, at module load. `registerVesselSource`
// replaces by id, so a hot reload cannot produce a duplicate row in the
// Sources panel.
registerGlobalFishingWatchSource();

/*
 * Datalastic — the commercial AIS foundation, switched on by default.
 *
 * Registered as the primary live provider. It queries the Nigerian EEZ
 * only, through the existing canonical refresh cycle: this adds a
 * provider, not a second polling loop. When the provider is
 * unauthorised, rate-limited, unreachable, or outside the plan's
 * entitlement, the Sources panel says which — an empty map is never
 * presented as an empty sea, and simulated traffic is never substituted
 * for it.
 */
const datalastic = registerDatalasticSource();

/*
 * The Nigerian Ports Authority schedule, folded into the same source.
 *
 * Registered as a wrapper under Datalastic's own id rather than as a
 * second provider: the update engine keys vessels by IMO, so two sources
 * reporting one hull would let whichever refreshed last decide whether
 * the ship is drawn at its live position or its port. Wrapping settles
 * the union once, before anything reaches the engine.
 *
 * The effect an officer sees is that vessels the port authority has
 * scheduled remain on the map when AIS cannot see them — drawn at their
 * port, and labelled as a place rather than a position.
 */
registerNpaAugmentedSource(datalastic);

/*
 * The simulation registers alongside it, switched off.
 *
 * Registered so an officer can turn it on from Sources like any other
 * provider, and `defaultEnabled: false` so it never turns itself on. An
 * empty map is the truthful default when nothing is connected, and a
 * demonstration that appears without being asked for is one somebody
 * will eventually mistake for the operational picture.
 */
/*
 * `?simSpeed=` accelerates the demonstration clock, and only when asked.
 *
 * A ship makes 6–18 knots, which at a port-scale zoom is about three
 * pixels of screen travel in thirty seconds. That is real movement and
 * it is impossible to watch, which makes the simulation impossible to
 * verify by looking at it. Rather than inflate the vessels' stated
 * speeds — which would make the readout lie — the clock runs faster and
 * the speeds stay honest.
 *
 * Default 1, so nothing is accelerated unless a demonstration explicitly
 * asks for it.
 */
function demonstrationTimeScale(): number {
  if (typeof window === "undefined") return 1;
  const requested = Number(new URLSearchParams(window.location.search).get("simSpeed"));
  return Number.isFinite(requested) && requested > 1 ? Math.min(requested, 500) : 1;
}

registerSimulatedVesselSource({ timeScale: demonstrationTimeScale() });

// Seed the enabled set AFTER registration.
//
// The SGS singleton is constructed when its module is first imported, which
// happens before any provider has registered — so its initial
// `enabledSources` is necessarily empty and a `defaultEnabled` provider
// would render switched off. Seeding here, at the composition root, is the
// only place both facts are known. Only applied when nothing is enabled, so
// an officer's explicit choice (including "none") is never overridden, and
// `loadFromURL` still wins because it runs later, on mount.
if (sgs.get().enabledSources.length === 0) {
  sgs.setEnabledSources(defaultEnabledSourceIds());
}

/*
 * Declare what the enabled providers can actually answer.
 *
 * After the enabled set is seeded, not merely after registration. A
 * provider with an adapter and no credentials is registered and useless,
 * and claiming its capabilities would have the Copilot announce live
 * positions nothing can supply. What is switched on is the honest
 * signal, because it is what the officer is looking at.
 *
 * Re-declared whenever the officer changes sources, so the claim tracks
 * the picture rather than the first frame of the session.
 */
/*
 * Warm the boundary outline the approach engine assesses against.
 *
 * Loaded here so the dispatcher can stay synchronous: an action that
 * had to await a fetch could not report its own outcome in the same
 * turn. A failed load leaves the ring empty and the assessment reports
 * the boundary as unavailable rather than assessing against nothing.
 */
void loadEezRing();

registerConnectedProviders(sgs.get().enabledSources);
sgs.subscribe((state) => registerConnectedProviders(state.enabledSources));

export const Route = createFileRoute("/maritime")({
  head: () => ({
    meta: [
      { title: "Live Command Map · Seaphore" },
      {
        name: "description",
        content: "Operational maritime picture across the Gulf of Guinea and the Nigerian EEZ.",
      },
    ],
  }),
  component: MaritimeCommand,
});
