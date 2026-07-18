import { createFileRoute } from "@tanstack/react-router";
import { DecideList } from "@/features/decision-support/DecideList";

export const Route = createFileRoute("/decide/")({
  head: () => ({ meta: [{ title: "Decision Support · Seaphore" }] }),
  component: DecideList,
});
