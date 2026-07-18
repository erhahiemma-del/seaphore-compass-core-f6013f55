import { createFileRoute } from "@tanstack/react-router";
import { DecisionSupportDefault } from "@/features/decision-support/DecideCase";

export const Route = createFileRoute("/decide/")({
  head: () => ({ meta: [{ title: "Decision Support · Seaphore" }] }),
  component: DecisionSupportDefault,
});
