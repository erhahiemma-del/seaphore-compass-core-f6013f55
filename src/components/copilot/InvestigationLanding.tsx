/**
 * InvestigationLanding — Sprint UX-02.
 *
 * The empty-state of the NIMASA Copilot workspace. Presentation only:
 * it owns no intelligence logic, makes no network calls and simply
 * hands the officer's text to the caller's `onSubmit`, which remains
 * the single canonical submission path into the orchestration pipeline.
 *
 * Design intent: this is an Intelligence Operations Console, not a chat
 * app. The investigation is the hero; the AI is invisible.
 */
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  DollarSign,
  Loader2,
  Mic,
  Package,
  Paperclip,
  Radar,
  Send,
  ShieldCheck,
  Ship,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { cn } from "@/lib/utils";


const TYPING_EXAMPLES = [
  "Investigate MV Ocean Pearl ownership",
  "Screen operator for sanctions",
  "Compare arrivals at Tin Can",
  "Explain revenue leakage",
  "Analyze cargo manifest",
  "Check AIS activity",
];

interface QuickStart {
  key: string;
  label: string;
  icon: LucideIcon;
  prompt: (subject: string) => string;
}

const QUICK_START: QuickStart[] = [
  { key: "vessel", label: "Investigate Vessel", icon: Ship, prompt: (s) => `Investigate ${s}` },
  {
    key: "ownership",
    label: "Ownership",
    icon: Building2,
    prompt: (s) => `Explain the ownership structure of ${s}`,
  },
  {
    key: "sanctions",
    label: "Sanctions",
    icon: ShieldCheck,
    prompt: (s) => `Screen ${s} and its operator for sanctions exposure`,
  },
  {
    key: "cargo",
    label: "Cargo",
    icon: Package,
    prompt: (s) => `Analyze the cargo and manifests for ${s}`,
  },
  {
    key: "ais",
    label: "AIS Replay",
    icon: Radar,
    prompt: (s) => `Check AIS activity and dark periods for ${s}`,
  },
  {
    key: "revenue",
    label: "Revenue",
    icon: DollarSign,
    prompt: (s) => `Assess revenue leakage risk for ${s}`,
  },
];

export interface InvestigationLandingProps {
  subject: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q: string) => void;
  pending?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function InvestigationLanding({
  subject,
  value,
  onChange,
  onSubmit,
  pending,
  inputRef,
}: InvestigationLandingProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? localRef;
  const [exampleIndex, setExampleIndex] = useState(0);

  // Rotating examples — only while the officer has not typed anything.
  useEffect(() => {
    if (value.trim()) return;
    const t = window.setInterval(
      () => setExampleIndex((i) => (i + 1) % TYPING_EXAMPLES.length),
      3200,
    );
    return () => window.clearInterval(t);
  }, [value]);

  // Auto-expand 2 → 8 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [value, ref]);

  const matches = value.trim()
    ? TYPING_EXAMPLES.filter((e) => e.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 3)
    : [];

  // --- Voice dictation -------------------------------------------------
  // The transcript is appended to whatever the officer already typed and is
  // never auto-submitted: the officer reviews the words and decides.
  const baselineRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const merge = (transcript: string) => {
    const base = baselineRef.current.trimEnd();
    onChange(base ? `${base} ${transcript}` : transcript);
  };

  const dictation = useVoiceDictation({
    onPartial: merge,
    onFinal: (text) => {
      merge(text);
      window.setTimeout(() => ref.current?.focus(), 0);
    },
    onError: (message) => toast.error(message),
  });

  const recording = dictation.state === "recording";
  const transcribing = dictation.state === "transcribing";

  function toggleDictation() {
    if (dictation.state === "idle") baselineRef.current = valueRef.current;
    dictation.toggle();
  }

  function insert(prompt: string) {
    onChange(prompt);
    window.setTimeout(() => ref.current?.focus(), 0);
  }


  return (
    <div className="animate-in fade-in flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-4 duration-500">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]"
          >
            <Telescope className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-foreground">
            What would you like to investigate?
          </h2>
          <p className="mt-1.5 max-w-lg text-[13px] text-muted-foreground">
            Enter a vessel, company, manifest, cargo, ownership, revenue or compliance question.
          </p>
        </div>

        {/* Primary investigation input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value);
          }}
          className="mt-5"
        >
          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border border-border/70 bg-background px-4 py-3",
              "shadow-[0_10px_30px_-12px_rgba(15,42,63,0.25)] transition-all duration-300",
              "focus-within:border-[color:var(--color-teal)]/60",
              "focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-teal)_14%,transparent),0_12px_34px_-12px_rgba(15,42,63,0.3)]",
            )}
          >
            <textarea
              ref={ref}
              value={value}
              rows={2}
              disabled={pending}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(value);
                }
              }}
              placeholder={`Investigate ${subject}...`}
              aria-label="Investigation query"
              className="max-h-44 min-h-[48px] flex-1 resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="flex items-center gap-1 pb-0.5">
              <button
                type="button"
                aria-label="Voice input"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Attach evidence"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="submit"
                aria-label="Start investigation"
                disabled={pending || !value.trim()}
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--color-teal)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="mt-2 flex min-h-[18px] items-center justify-between gap-3 px-1">
            <div className="min-w-0 flex-1">
              {matches.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {matches.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => insert(m)}
                      className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-[color:var(--color-teal)]/50 hover:text-foreground"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => insert(TYPING_EXAMPLES[exampleIndex]!)}
                  className="animate-in fade-in truncate text-[11.5px] text-muted-foreground/80 duration-500 hover:text-foreground"
                  key={exampleIndex}
                >
                  e.g. {TYPING_EXAMPLES[exampleIndex]}
                </button>
              )}
            </div>
            <p className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Shift + Enter = New Line
            </p>
          </div>
        </form>

        {/* Quick start — six actions, no descriptions */}
        <div className="mt-6">
          <p className="mb-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Quick Start
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUICK_START.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => insert(q.prompt(subject))}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-background px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-[color:var(--color-teal)]/50 hover:shadow-sm"
              >
                <q.icon className="h-4 w-4 text-[color:var(--color-teal)]" />
                <span className="text-[11px] font-medium leading-tight text-foreground">
                  {q.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
