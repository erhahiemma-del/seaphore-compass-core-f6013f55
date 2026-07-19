import { createFileRoute } from "@tanstack/react-router";
import { CargoCentre } from "@/features/cargo/Cargo";

export const Route = createFileRoute("/cargo")({
  head: () => ({
    meta: [
      { title: "Cargo Intelligence · Seaphore" },
      {
        name: "description",
        content: "Everything inside every ship. Know your cargo. Protect revenue.",
      },
    ],
  }),
  component: CargoCentre,
});
