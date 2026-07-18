import { createFileRoute } from "@tanstack/react-router";
import { EntityProfile } from "@/features/entity/EntityProfile";

export const Route = createFileRoute("/entity/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Entity · Seaphore` }],
  }),
  component: EntityProfile,
});
