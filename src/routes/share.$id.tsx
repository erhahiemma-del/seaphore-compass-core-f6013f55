import { createFileRoute } from "@tanstack/react-router";
import { SharePage } from "@/features/share/ShareCase";

export const Route = createFileRoute("/share/$id")({
  head: ({ params }) => ({ meta: [{ title: `${params.id} · Share · Seaphore` }] }),
  component: SharePage,
});
