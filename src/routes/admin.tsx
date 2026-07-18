import { createFileRoute } from "@tanstack/react-router";
import { Administration } from "@/features/administration/Administration";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration · Seaphore" }] }),
  component: Administration,
});
