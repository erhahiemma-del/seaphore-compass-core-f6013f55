import { createFileRoute } from "@tanstack/react-router";
import { MemoryPage } from "@/features/memory/Memory";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Institutional Memory · Seaphore" },
      { name: "description", content: "Every closed investigation becomes a searchable precedent." },
    ],
  }),
  component: MemoryPage,
});
