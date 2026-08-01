/**
 * OutcomeCaptureCard — Sprint 2.6 · Investigation Outcome & Learning Loop.
 *
 * Officer-facing form to record the final outcome of an investigation:
 * finalOutcome, officerDecision, actionTaken, resolutionStatus, success
 * rating, lessonsLearned, per-recommendation effectiveness, and optional
 * KPIs. Persists via workspace.store.recordOutcome; auto-close closes the
 * case which triggers OKL auto-ingest so the OIE reasoning lenses learn
 * from history.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, GraduationCap, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  useWorkspaceStore,
  type InvestigationWorkspace,
  type RecommendationEffectiveness,
  type RecommendationRating,
  type ResolutionStatus,
  type SuccessRating,
  type OutcomeKpi,
} from "@/stores/workspace.store";

const RESOLUTION: ResolutionStatus[] = [
  "RESOLVED",
  "PARTIALLY_RESOLVED",
  "UNRESOLVED",
  "ESCALATED",
  "REFERRED",
];
const SUCCESS: SuccessRating[] = ["SUCCESS", "PARTIAL_SUCCESS", "FAILURE", "INCONCLUSIVE"];
const EFFECTIVENESS: RecommendationEffectiveness[] = [
  "EFFECTIVE",
  "PARTIALLY_EFFECTIVE",
  "INEFFECTIVE",
  "NOT_ACTIONED",
];

function pretty(v: string): string {
  return v
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  w: InvestigationWorkspace;
}

export function OutcomeCaptureCard({ w }: Props) {
  const recordOutcome = useWorkspaceStore((s) => s.recordOutcome);
  const clearOutcome = useWorkspaceStore((s) => s.clearOutcome);
  const existing = w.outcome;

  // Seed ratings from workspace recommendations + panel-created recommendation.
  const seededRatings = useMemo<RecommendationRating[]>(() => {
    if (existing?.recommendationRatings?.length) return existing.recommendationRatings;
    const items: RecommendationRating[] = [];
    if (w.recommendation) {
      items.push({
        recommendationId: w.recommendation.id,
        label: w.recommendation.label,
        effectiveness: "NOT_ACTIONED",
      });
    }
    return items;
  }, [existing, w.recommendation]);

  const [finalOutcome, setFinalOutcome] = useState(existing?.finalOutcome ?? "");
  const [officerDecision, setOfficerDecision] = useState(existing?.officerDecision ?? "");
  const [actionTaken, setActionTaken] = useState(existing?.actionTaken ?? "");
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>(
    existing?.resolutionStatus ?? "RESOLVED",
  );
  const [success, setSuccess] = useState<SuccessRating>(existing?.success ?? "SUCCESS");
  const [lessonsLearned, setLessonsLearned] = useState(existing?.lessonsLearned ?? "");
  const [ratings, setRatings] = useState<RecommendationRating[]>(seededRatings);
  const [kpis, setKpis] = useState<OutcomeKpi[]>(existing?.kpis ?? []);
  const [closeOnRecord, setCloseOnRecord] = useState(w.status !== "CLOSED");

  const disabled =
    !finalOutcome.trim() ||
    !officerDecision.trim() ||
    !actionTaken.trim() ||
    !lessonsLearned.trim();

  function updateRating(idx: number, patch: Partial<RecommendationRating>) {
    setRatings((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function addRating() {
    setRatings((r) => [...r, { label: "", effectiveness: "EFFECTIVE" }]);
  }
  function removeRating(idx: number) {
    setRatings((r) => r.filter((_, i) => i !== idx));
  }
  function updateKpi(idx: number, patch: Partial<OutcomeKpi>) {
    setKpis((k) => k.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function addKpi() {
    setKpis((k) => [...k, { label: "", value: "" }]);
  }
  function removeKpi(idx: number) {
    setKpis((k) => k.filter((_, i) => i !== idx));
  }

  function submit() {
    if (disabled) return;
    const cleanRatings = ratings
      .map((r) => ({ ...r, label: r.label.trim() }))
      .filter((r) => r.label.length > 0);
    const cleanKpis = kpis
      .map((k) => ({ ...k, label: k.label.trim(), value: k.value.trim() }))
      .filter((k) => k.label.length > 0 && k.value.length > 0);
    recordOutcome(
      w.id,
      {
        finalOutcome: finalOutcome.trim(),
        officerDecision: officerDecision.trim(),
        actionTaken: actionTaken.trim(),
        resolutionStatus,
        success,
        lessonsLearned: lessonsLearned.trim(),
        recommendationRatings: cleanRatings,
        kpis: cleanKpis,
        recordedBy: w.officer ?? "Officer",
      },
      { closeOnRecord, closureNote: `Outcome captured · ${success.replace(/_/g, " ")}` },
    );
    toast.success(
      closeOnRecord
        ? "Outcome recorded and investigation closed — feeding Operational Knowledge Layer."
        : "Outcome recorded on this investigation.",
    );
  }

  return (
    <Card className="border-emerald-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <GraduationCap className="h-4 w-4 text-emerald-600" />
            Investigation Outcome & Lessons
          </CardTitle>
          {existing ? (
            <Badge
              variant="outline"
              className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
            >
              Recorded {new Date(existing.recordedAt).toLocaleDateString()}
            </Badge>
          ) : (
            <Badge variant="outline">Not yet captured</Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Every closed investigation records its outcome so the Operational Intelligence Engine can
          learn which recommendations worked. Evidence first. Officer decides.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Resolution status</Label>
            <Select
              value={resolutionStatus}
              onValueChange={(v) => setResolutionStatus(v as ResolutionStatus)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {pretty(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Success rating</Label>
            <Select value={success} onValueChange={(v) => setSuccess(v as SuccessRating)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUCCESS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {pretty(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Final outcome</Label>
          <Textarea
            className="min-h-16 text-xs"
            placeholder="What actually happened. Plain facts, evidence-backed."
            value={finalOutcome}
            onChange={(e) => setFinalOutcome(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Officer decision</Label>
          <Textarea
            className="min-h-16 text-xs"
            placeholder="What the officer decided. Signed accountability."
            value={officerDecision}
            onChange={(e) => setOfficerDecision(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Action taken</Label>
          <Textarea
            className="min-h-16 text-xs"
            placeholder="What was executed on the ground — detention, referral, no action, etc."
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Lessons learned</Label>
          <Textarea
            className="min-h-16 text-xs"
            placeholder="What Seaphore should remember for the next similar case."
            value={lessonsLearned}
            onChange={(e) => setLessonsLearned(e.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold">Recommendation effectiveness</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs"
              onClick={addRating}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {ratings.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No recommendations to rate. Add one to record whether a specific action worked.
            </p>
          )}
          {ratings.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-1.5">
              <Input
                className="h-7 text-xs"
                placeholder="Recommendation label"
                value={r.label}
                onChange={(e) => updateRating(i, { label: e.target.value })}
              />
              <Select
                value={r.effectiveness}
                onValueChange={(v) =>
                  updateRating(i, { effectiveness: v as RecommendationEffectiveness })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFECTIVENESS.map((x) => (
                    <SelectItem key={x} value={x} className="text-xs">
                      {pretty(x)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => removeRating(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold">KPIs (optional)</Label>
            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={addKpi}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {kpis.map((k, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <Input
                className="h-7 text-xs"
                placeholder="KPI label (e.g. Revenue recovered)"
                value={k.label}
                onChange={(e) => updateKpi(i, { label: e.target.value })}
              />
              <Input
                className="h-7 text-xs"
                placeholder="Value (e.g. USD 1.2M)"
                value={k.value}
                onChange={(e) => updateKpi(i, { value: e.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => removeKpi(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <label className="flex items-center gap-2 text-[11px]">
            <Checkbox
              checked={closeOnRecord}
              onCheckedChange={(v) => setCloseOnRecord(Boolean(v))}
              disabled={w.status === "CLOSED"}
            />
            Close investigation on record (triggers OKL learning ingest)
          </label>
          <div className="flex items-center gap-1.5">
            {existing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  if (confirm("Clear the captured outcome?")) clearOutcome(w.id);
                }}
              >
                Clear
              </Button>
            )}
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={disabled} onClick={submit}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {existing ? "Update outcome" : "Record outcome"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
