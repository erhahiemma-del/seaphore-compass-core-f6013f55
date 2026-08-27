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
registerSimulatedVesselSource();

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
