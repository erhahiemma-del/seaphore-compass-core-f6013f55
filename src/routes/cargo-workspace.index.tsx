import { createFileRoute } from "@tanstack/react-router";

import { CargoWorkspaceOverview } from "@/features/cargo-workspace/CargoWorkspace";

export const Route = createFileRoute("/cargo-workspace/")({
  head: () => ({
    meta: [
      { title: "Cargo Intelligence Workspace · Seaphore" },
      {
        name: "description",
        content:
          "Six cargo intelligence centres projected from the Canonical UIP — manifest, container, cargo, trade, revenue and cargo risk.",
      },
      { property: "og:title", content: "Cargo Intelligence Workspace · Seaphore" },
      {
        property: "og:description",
        content:
          "Manifest, container, cargo, trade, revenue and cargo risk intelligence in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CargoWorkspaceOverview,
});
