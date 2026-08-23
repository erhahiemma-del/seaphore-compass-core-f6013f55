import { createFileRoute } from "@tanstack/react-router";

import { DataSourcesPage } from "@/features/sources/DataSourcesPage";

export const Route = createFileRoute("/data-sources")({
  head: () => ({
    meta: [
      { title: "Data Sources · Seaphore" },
      {
        name: "description",
        content:
          "Evidence providers, their operational availability, and what each requires before it can be used.",
      },
    ],
  }),
  component: DataSourcesPage,
});
