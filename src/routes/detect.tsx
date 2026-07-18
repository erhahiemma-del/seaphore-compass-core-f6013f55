import { createFileRoute } from "@tanstack/react-router";
import { DetectPage } from "@/features/detect/Detect";

export const Route = createFileRoute("/detect")({
  head: () => ({
    meta: [
      { title: "Detect · Intelligence Feed · Seaphore" },
      { name: "description", content: "Continuous signal surface across every Intelligence Centre." },
    ],
  }),
  component: DetectPage,
});
