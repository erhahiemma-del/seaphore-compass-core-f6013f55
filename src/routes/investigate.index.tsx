import { createFileRoute } from "@tanstack/react-router";
import { InvestigateWorkspace } from "@/features/investigate/InvestigateCase";

/**
 * Default Investigate experience is the Voyage Workspace, opened on
 * the first active investigation. The investigations table lives at
 * /investigate/open.
 */
export const Route = createFileRoute("/investigate/")({
  head: () => ({
    meta: [{ title: "Investigate · Voyage Workspace · Seaphore" }],
  }),
  component: InvestigateWorkspace,
});
