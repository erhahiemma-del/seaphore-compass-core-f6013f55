import { useState } from "react";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import { ConfidenceChip, type ConfidenceTier } from "@/components/confidence-chip";
import { AskCopilotDialog } from "@/components/ai/ask-copilot-dialog";
import type { CopilotInstanceKey } from "@/lib/ai/types";

/**
 * Per-centre Copilot panel — Manifest Copilot, Cargo Truth Engine,
 * Revenue Assurance Copilot, etc.
 *
 * Every card must render in Seaphore signal language:
 *   VERIFIED / OBSERVED / INFERRED — never conclusive.
 */

export interface ObservedPattern {
  title: string;
  detail: string;
  confidence: ConfidenceTier;
}
export interface CopilotRec {
  title: string;
  detail: string;
  confidence: ConfidenceTier;
}
export interface HistoricalSim {
  title: string;
  detail: string;
  similarity: number; // 0..100
}
export interface RelatedInv {
  ref: string;
  title: string;
  status: "Open" | "Closed" | "Escalated";
}

export interface CentreCopilotProps {
  name: string; // "Manifest Copilot"
  observed: ObservedPattern[];
  recommendations: CopilotRec[];
  historical: HistoricalSim[];
  related: RelatedInv[];
  /** Bind to the shared Copilot engine (askCopilot). Defaults to "seaphore". */
  instance?: CopilotInstanceKey;
}

export function CentreCopilot({
  name,
  observed,
  recommendations,
  historical,
  related,
  instance = "seaphore",
}: CentreCopilotProps) {
  const [askOpen, setAskOpen] = useState(false);
  const [seed, setSeed] = useState("");
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-line/60 bg-surface/60 p-3">
        <header className="mb-1.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-purple)]/15 text-[color:var(--color-purple)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-[13.5px] font-semibold text-foreground">{name}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
            style={{ color: "#7C3AED", backgroundColor: "#7C3AED22" }}
          >
            BETA
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-green)]" />
            Active
          </span>
        </header>
        <p className="text-[11px] leading-snug text-slate">
          Signals from evidence. Recommendations from rules. Every action is yours.
        </p>
      </section>

      <Section title="Observed Patterns">
        <ul className="space-y-1.5">
          {observed.map((o) => (
            <li key={o.title} className="rounded-md border border-line/60 bg-surface/50 p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] font-semibold text-foreground">{o.title}</span>
                <ConfidenceChip tier={o.confidence} size={9} />
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate">{o.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Recommendations">
        <ul className="space-y-1.5">
          {recommendations.map((r) => (
            <li key={r.title}>
              <button className="flex w-full items-start gap-2 rounded-md border border-line/60 bg-surface/50 p-2 text-left hover:bg-surface/80">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-blue)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-foreground">
                      {r.title}
                    </span>
                    <ConfidenceChip tier={r.confidence} size={9} />
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate">{r.detail}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Historical Similarities">
        <ul className="space-y-1.5">
          {historical.map((h) => (
            <li key={h.title} className="rounded-md border border-line/60 bg-surface/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-semibold text-foreground">{h.title}</span>
                <span className="rounded bg-[color:var(--color-blue)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-blue)]">
                  {h.similarity}% match
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate">{h.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Related Investigations">
        <ul className="space-y-1">
          {related.map((r) => (
            <li key={r.ref} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-[12px] hover:bg-surface/50">
              <span className="min-w-0 truncate">
                <span className="mr-1.5 font-mono text-[11px] text-slate">{r.ref}</span>
                <span className="text-foreground/90">{r.title}</span>
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  backgroundColor:
                    r.status === "Open"
                      ? "#2563EB22"
                      : r.status === "Escalated"
                        ? "#C0392B22"
                        : "#5A6B7B22",
                  color:
                    r.status === "Open"
                      ? "#2563EB"
                      : r.status === "Escalated"
                        ? "#C0392B"
                        : "#5A6B7B",
                }}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="rounded-md border border-line/60 bg-surface/50 p-2">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
          Ask {name}
        </div>
        <div className="flex items-center gap-1.5 rounded border border-line/60 bg-background/40 px-2 py-1.5">
          <input
            placeholder={`Ask ${name}…`}
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate/70"
          />
          <button className="rounded bg-[color:var(--color-blue)] p-1 text-white hover:opacity-90">
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line/60 bg-surface/40 p-2.5">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
        {title}
      </div>
      {children}
    </section>
  );
}
