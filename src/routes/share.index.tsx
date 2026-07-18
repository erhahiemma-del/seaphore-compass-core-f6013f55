import { createFileRoute } from "@tanstack/react-router";
import { ShareList } from "@/features/share/ShareList";

export const Route = createFileRoute("/share/")({
  head: () => ({ meta: [{ title: "Share · Seaphore" }] }),
  component: ShareList,
});
