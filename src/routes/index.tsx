import { createFileRoute } from "@tanstack/react-router";
import { MissionControl } from "@/features/mission-control/MissionControl";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Mission Control · Seaphore" }] }),
  component: MissionControl,
});
