import { createFileRoute } from "@tanstack/react-router";
import { PortOpsCentre } from "@/features/ports/Ports";

export const Route = createFileRoute("/ports")({
  head: () => ({
    meta: [
      { title: "Port Operations · Seaphore" },
      { name: "description", content: "Nigerian port congestion, berth status and forecast." },
    ],
  }),
  component: PortOpsCentre,
});
