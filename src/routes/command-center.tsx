import { createFileRoute } from "@tanstack/react-router";
import { CommandCenter } from "@/features/mission-control/CommandCenter";

export const Route = createFileRoute("/command-center")({
  head: () => ({
    meta: [
      { title: "Command Center · Seaphore" },
      {
        name: "description",
        content:
          "Mission Control Command Center — Seaphore's platform-wide AI. Search, Retrieve, Interpret, and Advise across every intelligence centre.",
      },
    ],
  }),
  component: CommandCenter,
});
