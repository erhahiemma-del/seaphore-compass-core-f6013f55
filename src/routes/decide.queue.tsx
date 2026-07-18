import { createFileRoute } from "@tanstack/react-router";
import { DecideList } from "@/features/decision-support/DecideList";

export const Route = createFileRoute("/decide/queue")({
  head: () => ({ meta: [{ title: "Decision Queue · Seaphore" }] }),
  component: DecideList,
});
