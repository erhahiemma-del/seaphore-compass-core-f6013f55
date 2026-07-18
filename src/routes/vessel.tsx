import { createFileRoute } from "@tanstack/react-router";
import { VesselCentre } from "@/features/vessel/Vessel";

export const Route = createFileRoute("/vessel")({
  head: () => ({
    meta: [
      { title: "Vessel Intelligence · Seaphore" },
      { name: "description", content: "Vessel identity, behaviour, ownership and compliance." },
    ],
  }),
  component: VesselCentre,
});
