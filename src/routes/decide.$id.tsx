import { createFileRoute } from "@tanstack/react-router";
import { DecisionSupport } from "@/features/decision-support/DecideCase";

export const Route = createFileRoute("/decide/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Decision Support · Seaphore` }],
  }),
  component: DecisionSupport,
});
