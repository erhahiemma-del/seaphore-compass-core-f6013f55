import { createFileRoute } from "@tanstack/react-router";
import { EvidenceCentre } from "@/features/evidence/Evidence";

export const Route = createFileRoute("/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence Library · Seaphore" },
      { name: "description", content: "Document vault with audit-linked evidence for every investigation." },
    ],
  }),
  component: EvidenceCentre,
});
