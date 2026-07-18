import { createFileRoute } from "@tanstack/react-router";
import { ComplianceCentre } from "@/features/compliance/Compliance";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance Intelligence · Seaphore" },
      { name: "description", content: "Sanctions screening, PEP checks and entity resolution." },
    ],
  }),
  component: ComplianceCentre,
});
