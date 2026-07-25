/**
 * MissionsPanel — Mission Planning surface embedded inside a Maritime
 * Investigation Workspace.
 *
 * Mission Planning does NOT operate independently. This panel is the sole
 * entry point for creating missions from within an investigation and shows
 * every mission linked to the case with its status, objectives, and audit
 * lineage back to the investigation.
 *
 * Preconditions (enforced by the bridge, surfaced here):
 *   • officer-approved decision, OR
 *   • officer-approved recommendation, OR
 *   • linked OKL pattern.
 */
import { useMemo, useState } from "react";
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { useWorkspaceStore } from "@/stores/workspace.store";
import { useMissionStore, type MissionType } from "@/services/mission";
import {
  createMissionFromInvestigation,
  evaluateMissionEligibility,
} from "@/services/mission/from-investigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

const MISSION_TYPES: MissionType[] = [
  "surveillance",
  "interdiction",
  "inspection",
  "compliance-audit",
  "revenue-audit",
  "search-and-rescue",
  "escort",
];

export function MissionsPanel({ w }: { w: InvestigationWorkspace }) {
  const plans = useMissionStore((s) => s.plans);
  const linkMission = useWorkspaceStore((s) => s.linkMission);
  const submitForApproval = useMissionStore((s) => s.submitForApproval);
  const approve = useMissionStore((s) => s.approve);
  const [type, setType] = useState<MissionType>("inspection");

  const eligibility = useMemo(() => evaluateMissionEligibility(w), [w]);
  const linked = useMemo(
    () => plans.filter((p) => (w.missionPlanIds ?? []).includes(p.id)),
    [plans, w.missionPlanIds],
  );

  function handleCreate() {
    try {
      const { plan, eligibility: gate } = createMissionFromInvestigation({
        workspace: w,
        type,
        officer: w.officer,
      });
      linkMission(w.id, plan.id, `Bridged via ${gate.reason}`);
      toast.success("Mission plan created", {
        description: `${plan.name} · draft · linked to this investigation`,
      });
    } catch (err) {
      toast.error("Mission blocked", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold">Mission Planning</h3>
          <p className="text-[11px] text-muted-foreground">
            Missions may only be created from officer decisions, approved recommendations, or linked OKL patterns.
          </p>
        </div>
        <Badge variant={eligibility.eligible ? "default" : "secondary"} className="text-[10px]">
          {eligibility.eligible ? `Eligible · ${eligibility.reason.replace(/_/g, " ")}` : "Not yet eligible"}
        </Badge>
      </header>

      <div className="space-y-3 p-4">
        {!eligibility.eligible ? (
          <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            {eligibility.reason}
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Select value={type} onValueChange={(v) => setType(v as MissionType)}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MISSION_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t.replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleCreate}>
              Create mission plan
            </Button>
          </div>
        )}

        {linked.length === 0 ? (
          <p className="text-xs text-muted-foreground">No missions linked to this investigation yet.</p>
        ) : (
          <ul className="space-y-2">
            {linked.map((p) => (
              <li key={p.id} className="rounded border bg-background/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.type} · {p.subjects.length} subject{p.subjects.length === 1 ? "" : "s"} · {p.objectives.length} objectives · {p.tasks.length} tasks
                    </div>
                  </div>
                  <Badge className="text-[10px]" variant={p.status === "approved" ? "default" : "secondary"}>
                    {p.status}
                  </Badge>
                </div>

                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {p.objectives.slice(0, 3).map((o) => (
                    <li key={o.id}>• {o.label}</li>
                  ))}
                </ul>

                <div className="mt-2 flex items-center gap-2">
                  {p.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => submitForApproval(p.id, w.officer)}>
                      Submit for approval
                    </Button>
                  )}
                  {p.status === "pending-approval" && (
                    <Button size="sm" onClick={() => approve(p.id, w.officer, `Approved from investigation ${w.id}`)}>
                      Officer approve
                    </Button>
                  )}
                  <Link to="/missions" className="text-[11px] text-primary underline underline-offset-2">
                    Open in Mission Planning →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t pt-2 text-[10px] text-muted-foreground">
          Evidence first. Explainable always. Officer decides.
        </p>
      </div>
    </section>
  );
}
