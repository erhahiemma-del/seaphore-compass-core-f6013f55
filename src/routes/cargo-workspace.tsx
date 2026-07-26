import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/cargo-workspace")({
  component: () => <Outlet />,
});
