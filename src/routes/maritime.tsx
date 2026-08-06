import { createFileRoute } from "@tanstack/react-router";

import { MaritimeCommand } from "@/features/maritime/MaritimeCommand";
import { registerGlobalFishingWatchSource } from "@/services/geospatial";

// Register the live provider once, at module load. `registerVesselSource`
// replaces by id, so a hot reload cannot produce a duplicate row in the
// Sources panel.
registerGlobalFishingWatchSource();

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
