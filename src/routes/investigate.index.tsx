import { createFileRoute } from "@tanstack/react-router";
import { InvestigateList } from "@/features/investigate/InvestigateList";

export const Route = createFileRoute("/investigate/")({
  head: () => ({ meta: [{ title: "Investigate · Case Workspace · Seaphore" }] }),
  component: InvestigateList,
});
