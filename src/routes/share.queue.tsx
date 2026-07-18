import { createFileRoute } from "@tanstack/react-router";
import { ShareList } from "@/features/share/ShareList";

export const Route = createFileRoute("/share/queue")({
  head: () => ({ meta: [{ title: "Share Queue · Seaphore" }] }),
  component: ShareList,
});
