import { createFileRoute } from "@tanstack/react-router";
import { OwnershipCentre } from "@/features/ownership/Ownership";

export const Route = createFileRoute("/ownership")({
  head: () => ({
    meta: [
      { title: "Ownership Intelligence · Seaphore" },
      { name: "description", content: "Beneficial ownership chains, corporate tree and links." },
    ],
  }),
  component: OwnershipCentre,
});
