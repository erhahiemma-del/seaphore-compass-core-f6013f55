import { createFileRoute } from "@tanstack/react-router";

import { MaritimeCommand } from "@/features/maritime/MaritimeCommand";

export const Route = createFileRoute("/maritime")({
  head: () => ({
    meta: [
      { title: "Live Command Map · Seaphore" },
      {
        name: "description",
        content: "Operational maritime picture across the Gulf of Guinea and the Nigerian EEZ.",
      },
    ],
  }),
  component: MaritimeCommand,
});
