import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles, X } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { ModeBadge } from "@/components/ai/mode-badge";
import { EvidenceList } from "@/components/ai/evidence-list";
import { askCopilot } from "@/lib/ai/copilot.functions";
import { COPILOT_MODES } from "@/lib/ai/types";
import type {
  CopilotInstanceKey,
  CopilotMode,
  CopilotResponse,
} from "@/lib/ai/types";
import { COPILOT_REGISTRY } from "@/lib/ai/copilots";
import { classifyMode } from "@/lib/ai/nlq";
import { cn } from "@/lib/utils";

/**
 * "Ask Copilot" natural language dialog.
 *
 * Shared across every Copilot instance. Renders:
 *  • Mode chips (SEARCH / RETRIEVE / INTERPRET / ADVISE) — auto-classified,
 *    officer can override.
 *  • Free-text natural language input.
 *  • Structured response: summary + confidence + observed patterns +
 *    recommendations + historical + related — all with evidence (HR-11).
 *  • Follow-up chips for iterative refinement.
 *  • Mandatory "The officer decides" reminder in the footer.
 */
export interface AskCopilotDialogProps {
  instance: CopilotInstanceKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedQuery?: string;
  context?: Record<string, string>;
}

export function AskCopilotDialog({
  instance,
  open,
  onOpenChange,
  seedQuery = "",
  context,
}: AskCopilotDialogProps) {
  const inst = COPILOT_REGISTRY[instance];
  const [query, setQuery] = useState(seedQuery);
  const [mode, setMode] = useState<CopilotMode | undefined>(undefined);
  const [modeAutoLocked, setModeAutoLocked] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const askFn = useServerFn(askCopilot);
  const mutation = useMutation({
    mutationFn: (input: { instance: CopilotInstanceKey; query: string; mode?: CopilotMode }) =>
      askFn({ data: { ...input, context } }),
  });

  useEffect(() => {
    if (open) {
      setQuery(seedQuery);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, seedQuery]);

  const effectiveMode: CopilotMode = mode ?? (query ? classifyMode(query) : "SEARCH");

  if (!open) return null;

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    mutation.mutate({ instance, query: q, mode });
    setModeAutoLocked(true);
  };

  const response = mutation.data;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="mt-8 w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--color-purple)]/15 text-[color:var(--color-purple)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="type-h2 text-foreground">{inst.name}</h2>
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "#7C3AED", backgroundColor: "#7C3AED22" }}
              >
                BETA
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-green)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-green)]" />
                Active
              </span>
            </div>
            <p className="type-small mt-0.5 text-slate">
              Natural language intelligence · four modes · every answer with evidence.
            </p>
          </div>
          <button
            className="rounded-md p-1.5 text-slate hover:bg-surface-2"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-3">
          {/* Mode chips */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {COPILOT_MODES.map((m) => {
              const active = (mode ?? (query ? classifyMode(query) : "SEARCH")) === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setMode(m.key);
                    setModeAutoLocked(true);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    active
                      ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                      : "border-line bg-surface text-foreground/80 hover:bg-surface-2",
                  )}
                  title={m.question}
                >
                  <span className="text-[9px] opacity-70">{m.ordinal}</span>
                  {m.key}
                </button>
              );
            })}
            {!modeAutoLocked && query && (
              <span className="ml-1 self-center text-[10px] italic text-slate">
                auto: {effectiveMode.toLowerCase()}
              </span>
            )}
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 rounded-lg border border-line bg-surface/70 p-2">
            <textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={inst.exampleQueries[0]}
              className="flex-1 resize-none bg-transparent text-[13px] leading-snug text-foreground outline-none placeholder:text-slate/70"
            />
            <button
              type="button"
              onClick={submit}
              disabled={mutation.isPending || !query.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {mutation.isPending ? "Thinking…" : "Ask"}
              <Send className="h-3 w-3" />
            </button>
          </div>

          {/* Suggested queries */}
          {!response && (
            <div className="mt-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
                Try
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {inst.exampleQueries.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuery(q)}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-surface-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mutation.isError && (
            <div className="mt-3 rounded-md border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 p-2 text-[12px] text-[color:var(--color-red)]">
              Copilot unavailable. Try again shortly.
            </div>
          )}

          {response && <ResponseBlock response={response} onFollowUp={(q) => setQuery(q)} />}
        </div>

        <footer className="border-t border-line bg-surface/60 px-4 py-2 text-[10.5px] text-slate">
          Evidence first. Explainable always. Officer decides.
        </footer>
      </div>
    </div>
  );
}

function ResponseBlock({
  response,
  onFollowUp,
}: {
  response: CopilotResponse;
  onFollowUp: (q: string) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-lg border border-line bg-surface/60 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <ModeBadge mode={response.mode} />
          <ConfidenceChip tier={response.confidence} />
          {response.insufficientEvidence && (
            <span
              className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]"
              style={{ color: "#8A98A6", backgroundColor: "#8A98A614" }}
            >
              Insufficient evidence
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate">
            {response.served} · {response.latencyMs}ms
          </span>
        </div>
        <p className="text-[13px] leading-snug text-foreground">{response.summary}</p>
      </section>

      {response.observations.length > 0 && (
        <Section title="Observed Patterns">
          <ul className="space-y-1.5">
            {response.observations.map((o) => (
              <li key={o.id} className="rounded-md border border-line/60 bg-surface/50 p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] leading-snug text-foreground">{o.text}</p>
                  <ConfidenceChip tier={o.confidence} size={9} />
                </div>
                <EvidenceList items={o.evidence} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {response.recommendations.length > 0 && (
        <Section title="Recommendations">
          <ul className="space-y-1.5">
            {response.recommendations.map((r) => (
              <li key={r.id} className="rounded-md border border-line/60 bg-surface/50 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[12.5px] font-semibold text-foreground">{r.action}</div>
                    <div className="text-[11px] text-slate">Why: {r.rationale}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RiskPill level={r.risk} />
                    <ConfidenceChip tier={r.confidence} size={9} />
                  </div>
                </div>
                <EvidenceList items={r.evidence} />
                {r.route && (
                  <a
                    href={r.route}
                    className="mt-2 inline-block text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline"
                  >
                    View workspace →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {response.historical.length > 0 && (
        <Section title="Historical Similarities">
          <ul className="space-y-1">
            {response.historical.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-2 rounded-md bg-surface/50 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="type-mono text-[11px] font-semibold text-foreground">{h.caseRef}</div>
                  <div className="truncate text-[11.5px] text-foreground/85">{h.summary}</div>
                  <div className="text-[10.5px] text-slate">{h.outcome}</div>
                </div>
                <span className="shrink-0 rounded bg-[color:var(--color-blue)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-blue)]">
                  {h.matchPct}% match
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {response.followUps.length > 0 && (
        <Section title="Follow up">
          <div className="flex flex-wrap gap-1.5">
            {response.followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowUp(q)}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-foreground/85 hover:bg-surface-2"
              >
                {q}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate">
        {title}
      </div>
      {children}
    </section>
  );
}
