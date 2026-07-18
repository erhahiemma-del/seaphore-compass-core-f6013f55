import { createFileRoute } from "@tanstack/react-router";
import { ManifestCentre } from "@/features/manifest/Manifest";

export const Route = createFileRoute("/manifest")({
  head: () => ({
    meta: [
      { title: "Manifest Intelligence · Seaphore" },
      { name: "description", content: "Everything entering Nigeria. Monitor, analyse and act." },
    ],
  }),
  component: ManifestCentre,
});
