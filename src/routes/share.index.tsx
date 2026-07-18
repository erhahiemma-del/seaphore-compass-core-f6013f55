import { createFileRoute } from "@tanstack/react-router";
import { ShareDefault } from "@/features/share/ShareCase";

export const Route = createFileRoute("/share/")({
  head: () => ({ meta: [{ title: "Share · Seaphore" }] }),
  component: ShareDefault,
});
