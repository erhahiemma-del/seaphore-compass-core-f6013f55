import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for /investigate. The list and per-case workspace live
 * in sibling files (investigate.index.tsx, investigate.$id.tsx).
 */
export const Route = createFileRoute("/investigate")({
  component: () => <Outlet />,
});
