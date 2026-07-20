import { createFileRoute } from "@tanstack/react-router";
import { AdministrationCenter } from "@/features/administration/AdministrationCenter";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Administration & Configuration Center · Seaphore" },
      {
        name: "description",
        content: "System Management. Platform Configuration. Operational Control.",
      },
    ],
  }),
  component: AdministrationCenter,
});
