import { createFileRoute } from "@tanstack/react-router";

import { MaritimeCommand } from "@/features/maritime/MaritimeCommand";
import {
  defaultEnabledSourceIds,
  registerGlobalFishingWatchSource,
  sgs,
} from "@/services/geospatial";
import { registerSimulatedVesselSource } from "@/services/geospatial/sources/simulated-vessel-source";

// Register the live provider once, at module load. `registerVesselSource`
// replaces by id, so a hot reload cannot produce a duplicate row in the
// Sources panel.
registerGlobalFishingWatchSource();

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
