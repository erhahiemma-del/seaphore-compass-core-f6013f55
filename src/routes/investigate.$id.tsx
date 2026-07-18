import { createFileRoute } from "@tanstack/react-router";
import { InvestigateWorkspace } from "@/features/investigate/InvestigateCase";

export const Route = createFileRoute("/investigate/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Investigate · Seaphore` }],
  }),
  component: InvestigateWorkspace,
});
