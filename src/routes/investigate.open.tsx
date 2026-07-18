import { createFileRoute } from "@tanstack/react-router";
import { InvestigateList } from "@/features/investigate/InvestigateList";

export const Route = createFileRoute("/investigate/open")({
  head: () => ({
    meta: [{ title: "Open Investigations · Seaphore" }],
  }),
  component: InvestigateList,
});
