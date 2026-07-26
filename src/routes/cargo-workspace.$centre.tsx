import { createFileRoute, notFound } from "@tanstack/react-router";

import { CargoCentreScreen } from "@/features/cargo-workspace/CargoWorkspace";
import { cargoCentreBySlug } from "@/lib/intelligence/cargo-workspace-projection";

export const Route = createFileRoute("/cargo-workspace/$centre")({
  beforeLoad: ({ params }) => {
    if (!cargoCentreBySlug(params.centre)) throw notFound();
  },
  head: ({ params }) => {
    const centre = cargoCentreBySlug(params.centre);
    const title = centre ? `${centre.title} · Seaphore` : "Cargo Intelligence · Seaphore";
    const description =
      centre?.subtitle ?? "Cargo intelligence centre projected from the Canonical UIP.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="p-8 text-sm">That cargo intelligence centre does not exist.</div>
  ),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-sm">
      {error.message}
    </div>
  ),
  component: CargoCentreRoute,
});

function CargoCentreRoute() {
  const { centre } = Route.useParams();
  const def = cargoCentreBySlug(centre);
  if (!def) return null;
  return <CargoCentreScreen centre={def} />;
}
