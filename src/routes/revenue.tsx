import { createFileRoute } from "@tanstack/react-router";
import { RevenueCentre } from "@/features/revenue/Revenue";

export const Route = createFileRoute("/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue Intelligence · Seaphore" },
      { name: "description", content: "Protect government revenue. Monitor, analyse and act." },
    ],
  }),
  component: RevenueCentre,
});
