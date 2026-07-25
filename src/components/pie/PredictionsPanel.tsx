/**
 * PredictionsPanel — evidence-backed forecast surface for the officer.
 *
 * Every prediction shows: subject, headline, probability, OC-001 confidence,
 * horizon, contributing factors (with weights), alternative hypotheses,
 * baseline stats, and clickable evidence citations.
 *
 * Golden Rule: Predict early. Explain every prediction. Learn continuously.
 * Never make a prediction without evidence.
 */
import { useMemo } from "react";
import { usePieStore } from "@/services/pie";
import type { Prediction, PredictionSeverity } from "@/services/pie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Radar, TrendingDown, TrendingUp } from "lucide-react";

const severityStyle: Record<PredictionSeverity, string> = {
  info: "bg-muted text-muted-foreground",
  watch: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  elevated: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
};

export function PredictionsPanel({ entityId }: { entityId?: string }) {
  const predictions = usePieStore((s) => s.predictions);
  const filtered = useMemo(
    () => (entityId ? predictions.filter((p) => p.subject.id === entityId) : predictions),
    [predictions, entityId],
  );

  if (filtered.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4" /> Predictive Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No predictions yet. PIE will surface forecasts once fused evidence is available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((p) => (
        <PredictionCard key={p.id} prediction={p} />
      ))}
    </div>
  );
}

function PredictionCard({ prediction: p }: { prediction: Prediction }) {
  const Icon = p.category === "revenue-anomaly" || p.category === "cargo-anomaly"
    ? (p.baseline?.zScore ?? 0) < 0 ? TrendingDown : TrendingUp
    : p.alert ? AlertTriangle : Radar;

  return (
    <Card className={`border ${severityStyle[p.severity]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {p.headline}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] uppercase">{p.category.replace(/-/g, " ")}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{p.horizon}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase">OC-001 · {p.confidence}</Badge>
            {p.alert && <Badge variant="destructive" className="text-[10px] uppercase">ALERT</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Subject: <span className="font-medium">{p.subject.primaryLabel}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div>
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            <span>Model probability</span>
            <span className="font-semibold text-foreground">{Math.round(p.probability * 100)}%</span>
          </div>
          <Progress value={Math.round(p.probability * 100)} className="h-1.5" />
        </div>

        <p className="text-sm">{p.explanation}</p>

        {p.factors.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Contributing factors
            </h4>
            <ul className="space-y-1">
              {p.factors.map((f, i) => (
                <li key={i} className="text-xs flex justify-between gap-2 border-l-2 border-muted pl-2">
                  <span>{f.label}</span>
                  <span className="text-muted-foreground shrink-0">
                    {f.weight >= 0 ? "+" : ""}
                    {(f.weight * 100).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.baseline && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            Baseline · {p.baseline.metric}: mean {p.baseline.mean.toFixed(1)} ± {p.baseline.stddev.toFixed(1)}
            {" "}(n={p.baseline.n}) · observed {p.baseline.observed.toFixed(1)} · z={p.baseline.zScore.toFixed(2)}
          </div>
        )}

        {p.alternatives.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Alternative hypotheses
            </h4>
            <ul className="space-y-1">
              {p.alternatives.map((a, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-muted-foreground">({Math.round(a.probability * 100)}%)</span>
                  <div className="text-muted-foreground">{a.rationale}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.citations.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Evidence ({p.citations.length})
            </h4>
            <ul className="space-y-0.5">
              {p.citations.slice(0, 6).map((c) => (
                <li key={c.evidenceId} className="text-[11px] text-muted-foreground flex gap-2">
                  <Badge variant="outline" className="text-[9px]">{c.grade}</Badge>
                  <span className="truncate">
                    {c.sourceName} · {new Date(c.observedAt).toLocaleString()}
                  </span>
                </li>
              ))}
              {p.citations.length > 6 && (
                <li className="text-[11px] text-muted-foreground">
                  +{p.citations.length - 6} more…
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
