import { createFileRoute } from "@tanstack/react-router";
import { AlertsCentre } from "@/features/alerts/Alerts";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts Center · Seaphore" },
      { name: "description", content: "Live intelligence alerts across every centre." },
    ],
  }),
  component: AlertsCentre,
});
