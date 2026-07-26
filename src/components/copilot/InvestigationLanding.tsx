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
  FileSpreadsheet,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Package,
  Paperclip,
  Radar,
  Send,
  ShieldCheck,
  Ship,
  Telescope,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  useOfficerAttachments,
  type OfficerAttachment,
} from "@/hooks/use-officer-attachments";
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
  onSubmit: (q: string, attachments?: OfficerAttachment[]) => void;
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
    onError: (problem) =>
      toast.error(problem.title, {
        description: `${problem.detail} ${problem.hint}`,
        duration: problem.blocking ? 10000 : 6000,
      }),
  });

  const recording = dictation.state === "recording";
  const transcribing = dictation.state === "transcribing";
  const micBlocked = !dictation.supported || dictation.permission === "denied";
  const micNotice = dictation.unavailable ?? dictation.issue;

  function toggleDictation() {
    if (dictation.state === "idle") baselineRef.current = valueRef.current;
    dictation.toggle();
  }


  function insert(prompt: string) {
    onChange(prompt);
    window.setTimeout(() => ref.current?.focus(), 0);
  }

  // --- Officer attachments (manifests / documents) ---------------------
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const files = useOfficerAttachments({ onError: (m) => toast.error(m) });
  const canSubmit = Boolean(value.trim()) && !pending && !files.uploading;

  function submit() {
    if (!canSubmit) return;
    onSubmit(value, files.attachments);
    files.clear();
  }

  // --- Drag & drop -----------------------------------------------------
  // dragenter/dragleave fire for every nested child, so a boolean flickers as
  // the pointer crosses the textarea or buttons. Counting depth is stable.
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const dropDisabled = pending || files.uploading;

  /** True only for an OS file drag — ignores dragged text or links. */
  function carriesFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  function onDragEnter(e: React.DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    if (!dropDisabled) setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault(); // Required, or the browser opens the file instead.
    e.dataTransfer.dropEffect = dropDisabled ? "none" : "copy";
  }

  function onDragLeave(e: React.DragEvent) {
    if (!carriesFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (dropDisabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    // Folders arrive as zero-byte entries with no type; say so rather than
    // failing silently on an upload the officer believes succeeded.
    const usable = dropped.filter((f) => f.size > 0 || f.type);
    if (usable.length < dropped.length) {
      toast.error("Folders can't be attached", {
        description: "Drop the individual manifests or documents instead.",
      });
    }
    if (usable.length > 0) void files.add(usable);
  }






  return (
    <div
      data-testid="investigation-landing"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="animate-in fade-in relative flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-4 duration-500"
    >
      {dragging && (
        <div
          data-testid="attachment-dropzone"
          className={cn(
            "animate-in fade-in pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2",
            "rounded-2xl border-2 border-dashed border-[color:var(--color-teal)]/70",
            "bg-background/85 backdrop-blur-[2px] duration-150",
          )}
        >
          <Paperclip className="h-6 w-6 text-[color:var(--color-teal)]" />
          <p className="text-[14px] font-semibold text-foreground">Drop to attach</p>
          <p className="text-[12px] text-muted-foreground">
            Manifests and documents are uploaded as officer-supplied evidence.
          </p>
        </div>
      )}



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
            submit();
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
                  submit();
                }
              }}

              placeholder={
                recording
                  ? "Listening — speak your investigation..."
                  : transcribing
                    ? "Transcribing..."
                    : `Investigate ${subject}...`
              }
              aria-label="Investigation query"
              className="max-h-44 min-h-[48px] flex-1 resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="flex items-center gap-1 pb-0.5">
              <button
                type="button"
                onClick={toggleDictation}
                /* A blocked permission keeps the button live: pressing it is how
                   the officer gets the explanation and the unblock steps. */
                disabled={pending || transcribing || !dictation.supported}
                aria-label={
                  recording
                    ? "Stop dictation"
                    : micBlocked
                      ? "Voice input unavailable — see guidance"
                      : "Voice input"
                }
                aria-pressed={recording}
                title={
                  !dictation.supported
                    ? (dictation.unavailable?.title ?? "Voice input is not available here")
                    : dictation.permission === "denied"
                      ? "Microphone blocked — click for how to enable it"
                      : recording
                        ? "Stop dictation"
                        : dictation.permission === "prompt" || dictation.permission === "unknown"
                          ? "Dictate your investigation — your browser will ask for microphone access"
                          : "Dictate your investigation"
                }
                className={cn(
                  "relative rounded-full p-2 transition-colors disabled:opacity-40",
                  recording
                    ? "bg-destructive/10 text-destructive"
                    : micBlocked
                      ? "text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {transcribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : micBlocked ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className={cn("h-4 w-4", recording && "animate-pulse")} />
                )}
                {recording ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-destructive/40 transition-transform duration-100"
                    style={{ transform: `scale(${1 + Math.min(dictation.level, 1) * 0.35})` }}
                  />
                ) : null}
              </button>


              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void files.add(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Attach manifest or document"
                title="Attach a manifest or document (PDF, CSV, XLSX, DOCX, image — max 20 MB)"
                disabled={pending || files.uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {files.uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>
              <button
                type="submit"
                aria-label="Start investigation"
                disabled={!canSubmit}
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

          {/* Voice fallback notice. Persistent (not just a toast) so the
              officer always knows why the mic is unavailable and that typing
              remains a complete route to the investigation. */}
          {micNotice ? (
            <div
              data-testid="dictation-notice"
              role="status"
              className="mt-2 flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-[12px] leading-5"
            >
              <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{micNotice.title}.</span>{" "}
                {micNotice.detail} {micNotice.hint}
              </p>
              {!dictation.unavailable ? (
                <button
                  type="button"
                  aria-label="Dismiss microphone notice"
                  onClick={dictation.clearIssue}
                  className="ml-auto rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ) : null}



          {files.attachments.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 px-1">
              {files.attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 py-1 pl-2.5 pr-1.5 text-[11px] text-foreground"
                >
                  {a.kind === "MANIFEST" ? (
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-teal)]" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-teal)]" />
                  )}
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => void files.remove(a.id)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <span className="self-center text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Officer-supplied evidence
              </span>
            </div>
          ) : null}



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
          <div data-testid="quick-start-grid" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
