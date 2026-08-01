/**
 * SPRINT CAP-04 — Cargo Investigation dossier, officer projection.
 *
 * Renders the ten mandated sections. Every section shows its weakest
 * supporting grade and its citations; empty sections state the gap
 * rather than disappearing.
 */
import { Boxes, FileSearch, Quote } from "lucide-react";

import { PanelCard } from "@/components/panel-card";
import { Button } from "@/components/ui/button";
import type { CargoDossier } from "@/services/copilot/cargo";

export function CargoDossierPanel({
  dossier,
  onFollowUp,
  onOpenInvestigation,
}: {
  dossier: CargoDossier;
  onFollowUp?: (q: string) => void;
  onOpenInvestigation?: () => void;
}) {
  const { route, focus } = dossier;

  return (
    <PanelCard className="mb-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            <Boxes className="h-4 w-4" /> Cargo Investigation —{" "}
            {focus ? focus.label : "no resolved subject"}
          </h3>
          <p className="text-[11.5px] text-muted-foreground">
            {route.intent} · {dossier.evidenceCount} evidence record
            {dossier.evidenceCount === 1 ? "" : "s"} · weakest grade {dossier.grade} · Canonical UIP{" "}
            {dossier.uipId ?? "none in session"}
          </p>
        </div>
        {onOpenInvestigation && !dossier.empty ? (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onOpenInvestigation}>
            <FileSearch className="mr-1 h-3.5 w-3.5" /> Open investigation
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        {dossier.sections.map((s) => (
          <section key={s.id} className="rounded-lg border border-border/60 bg-[#FAFBFC] px-3 py-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[12px] font-semibold text-foreground">{s.title}</h4>
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {s.grade}
                {s.citations.length > 0
                  ? ` · ${s.citations.length} citation${s.citations.length === 1 ? "" : "s"}`
                  : " · no citations"}
              </span>
            </div>
            <ul className="space-y-1">
              {s.lines.map((line, i) => (
                <li
                  key={`${s.id}-${i}`}
                  className={
                    s.empty
                      ? "text-[12px] italic text-muted-foreground"
                      : "text-[12px] text-foreground/85"
                  }
                >
                  {s.id === "next-best-actions" && onFollowUp && !s.empty ? (
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onFollowUp(line)}
                    >
                      {line}
                    </button>
                  ) : (
                    line
                  )}
                </li>
              ))}
            </ul>
            {!s.empty && s.gap ? (
              <p className="mt-1 text-[11.5px] text-muted-foreground">{s.gap}</p>
            ) : null}
            {s.citations.length > 0 ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  <Quote className="mr-1 inline h-3 w-3" />
                  Evidence citations
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {s.citations.slice(0, 12).map((c) => (
                    <li
                      key={`${s.id}-${c.evidenceId}`}
                      className="text-[11px] text-muted-foreground"
                    >
                      {c.source} · {c.evidenceId} · {c.observedAt.slice(0, 16).replace("T", " ")} ·{" "}
                      {c.grade}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Built from the Canonical UIP through the Cargo Knowledge Graph. No provider was queried for
        this dossier. System recommends; officer decides.
      </p>
    </PanelCard>
  );
}
