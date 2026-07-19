import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Mic, Search, Send, X } from "lucide-react";

import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { ModeBadge } from "@/components/ai/mode-badge";
import { EvidenceList } from "@/components/ai/evidence-list";
import { askCopilot } from "@/lib/ai/copilot.functions";
import type {
  CopilotInstanceKey,
  CopilotMode,
  CopilotResponse,
} from "@/lib/ai/types";
import { COPILOT_REGISTRY } from "@/lib/ai/copilots";
import { classifyMode } from "@/lib/ai/nlq";
import { cn } from "@/lib/utils";
import nimasaLogo from "@/assets/nimasa-logo.png";

/**
 * Universal Seaphore Copilot modal.
 *
 * Zero state is intentionally minimal — title, subtitle, query input,
 * mic, send, three context-aware suggested prompts, close. After the
 * first query the modal transitions into the SEARCH → RETRIEVE →
 * INTERPRET → ADVISE workflow while keeping the officer's conversation.
 */
export interface AskCopilotDialogProps {
  instance: CopilotInstanceKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedQuery?: string;
  context?: Record<string, string>;
}

interface Turn {
  id: string;
  query: string;
  response?: CopilotResponse;
  error?: boolean;
}

const SUBTITLES: Partial<Record<CopilotInstanceKey, string>> = {
  seaphore: "Ask about vessels, cargo, ports, or companies",
  vessel: "Ask about voyages, AIS traces, or vessel history",
  ports: "Ask about berths, dwell time, or port throughput",
  revenue: "Ask about leakage, exposure, or revenue-at-risk",
  manifest: "Ask about declarations, duplicates, or HS codes",
  cargo: "Ask about containers, seals, or declared vs observed cargo",
  ownership: "Ask about directors, ownership graphs, or sanctions links",
  compliance: "Ask about violations, sanctions, or overdue inspections",
  evidence: "Ask about documents, chain-of-custody, or version history",
  alerts: "Ask about triage queue, correlations, or SLA breaches",
  memory: "Ask about analogous cases, precedents, or lessons",
  administration: "Ask about roles, sign-ins, or system health",
};

export function AskCopilotDialog({
  instance,
  open,
  onOpenChange,
  seedQuery = "",
  context,
}: AskCopilotDialogProps) {
  const inst = COPILOT_REGISTRY[instance];
  const subtitle = SUBTITLES[instance] ?? SUBTITLES.seaphore!;
  const [query, setQuery] = useState(seedQuery);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askCopilot);

  const mutation = useMutation({
    mutationFn: (input: { instance: CopilotInstanceKey; query: string; mode?: CopilotMode }) =>
      askFn({ data: { ...input, context } }),
  });

  useEffect(() => {
    if (open) {
      setQuery(seedQuery);
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      // reset conversation when closed
      setTurns([]);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedQuery]);

  useEffect(() => {
    if (turns.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [turns]);

  const submit = (raw?: string) => {
    const q = (raw ?? query).trim();
    if (!q) return;
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id, query: q }]);
    setQuery("");
    mutation.mutate(
      { instance, query: q },
      {
        onSuccess: (response) =>
          setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, response } : turn))),
        onError: () =>
          setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, error: true } : turn))),
      },
    );
  };

  const startVoice = () => {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognition;
      SpeechRecognition?: new () => SpeechRecognition;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results[0]?.[0]?.transcript ?? "";
      setQuery((q) => (q ? `${q} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const suggestions = useMemo(() => inst.exampleQueries.slice(0, 3), [inst]);
  const hasConversation = turns.length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0B1220]/70 p-4 backdrop-blur-sm">
      <div className="mt-8 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
          <img
            src={nimasaLogo}
            alt="NIMASA"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
          />
          <h2 className="flex-1 text-[18px] font-bold text-slate-900">{inst.name}</h2>
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div
          ref={scrollRef}
          className={cn(
            "flex flex-col overflow-y-auto bg-white px-6",
            hasConversation ? "max-h-[70vh] py-6" : "py-14",
          )}
        >
          {!hasConversation && (
            <p className="mb-4 text-center text-[15px] font-semibold text-slate-800">
              {subtitle}
            </p>
          )}

          {hasConversation && (
            <div className="space-y-6">
              {turns.map((turn) => (
                <TurnBlock
                  key={turn.id}
                  turn={turn}
                  pending={mutation.isPending && !turn.response && !turn.error}
                  onFollowUp={(q) => submit(q)}
                />
              ))}
            </div>
          )}

          {/* Input row */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border-2 border-[#2563EB] bg-white px-3 py-2 shadow-sm",
              hasConversation ? "mt-6" : "",
            )}
          >
            <Search className="h-5 w-5 shrink-0 text-slate-500" />
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
              rows={1}
              placeholder="Ask anything…"
              className="flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug text-slate-900 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={startVoice}
              aria-label="Voice input"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50",
                listening && "border-[#2563EB] text-[#2563EB]",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => submit()}
              disabled={mutation.isPending || !query.trim()}
              aria-label="Send"
              className="flex h-9 w-11 items-center justify-center rounded-md bg-[#2563EB] text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {/* Suggestions (zero state only) */}
          {!hasConversation && (
            <div className="mt-6">
              <div className="text-[13px] font-semibold text-slate-700">Try:</div>
              <ul className="mt-2 space-y-2">
                {suggestions.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => submit(q)}
                      className="inline-flex items-center gap-2 text-left text-[14px] font-semibold text-[#2563EB] hover:underline"
                    >
                      {q}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white px-6 py-3 text-center text-[12px] text-slate-500">
          Powered by Seaphore
        </div>
      </div>
    </div>
  );
}

function TurnBlock({
  turn,
  pending,
  onFollowUp,
}: {
  turn: Turn;
  pending: boolean;
  onFollowUp: (q: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#2563EB] px-4 py-2 text-[14px] font-medium text-white">
          {turn.query}
        </div>
      </div>
      {pending && (
        <div className="text-[13px] italic text-slate-500">
          Searching → Retrieving → Interpreting…
        </div>
      )}
      {turn.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[13px] text-red-700">
          Copilot unavailable. Try again shortly.
        </div>
      )}
      {turn.response && <ResponseBlock response={turn.response} onFollowUp={onFollowUp} />}
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
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ModeBadge mode={response.mode} />
        <ConfidenceChip tier={response.confidence} />
        {response.insufficientEvidence && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "#8A98A6", backgroundColor: "#8A98A614" }}
          >
            Insufficient evidence
          </span>
        )}
        <span className="ml-auto text-[10.5px] text-slate-500">
          {response.served} · {response.latencyMs}ms
        </span>
      </div>
      <p className="text-[14px] leading-relaxed text-slate-900">{response.summary}</p>

      {response.observations.length > 0 && (
        <Section title="Observed Patterns">
          <ul className="space-y-2">
            {response.observations.map((o) => (
              <li key={o.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] leading-snug text-slate-900">{o.text}</p>
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
          <ul className="space-y-2">
            {response.recommendations.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold text-slate-900">{r.action}</div>
                    <div className="text-[12px] text-slate-500">Why: {r.rationale}</div>
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
                    className="mt-2 inline-block text-[12px] font-semibold text-[#2563EB] hover:underline"
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
              <li
                key={h.id}
                className="flex items-start justify-between gap-2 rounded-md bg-white px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="type-mono text-[11px] font-semibold text-slate-900">
                    {h.caseRef}
                  </div>
                  <div className="truncate text-[12.5px] text-slate-800">{h.summary}</div>
                  <div className="text-[11px] text-slate-500">{h.outcome}</div>
                </div>
                <span className="shrink-0 rounded bg-[#2563EB]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563EB]">
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
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 hover:bg-slate-100"
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
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      {children}
    </section>
  );
}
