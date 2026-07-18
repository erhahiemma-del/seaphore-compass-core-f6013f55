import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Radar,
  History,
  BrainCircuit,
  Compass,
  Upload,
  FileText,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Loader2,
  RotateCw,
} from "lucide-react";


import { AppShell } from "@/components/app-shell";
import { PanelCard } from "@/components/panel-card";
import { ConfidenceChip } from "@/components/confidence-chip";
import { RiskPill } from "@/components/risk-pill";
import { AskCopilotDialog } from "@/components/ai/ask-copilot-dialog";
import { ModeBadge } from "@/components/ai/mode-badge";
import { COPILOT_MODES } from "@/lib/ai/types";
import type { CopilotMode } from "@/lib/ai/types";
import { COPILOT_REGISTRY } from "@/lib/ai/copilots";

export const Route = createFileRoute("/command-center")({
  head: () => ({
    meta: [
      { title: "Command Center · Seaphore" },
      {
        name: "description",
        content:
          "Mission Control Command Center — Seaphore's platform-wide AI. Search, Retrieve, Interpret, and Advise across every intelligence centre.",
      },
    ],
  }),
  component: CommandCenter,
});

const MODE_ICON: Record<CopilotMode, React.ComponentType<{ className?: string }>> = {
  SEARCH: Radar,
  RETRIEVE: History,
  INTERPRET: BrainCircuit,
  ADVISE: Compass,
};

const TRY_QUERIES: string[] = [
  "Show vessels entering Lagos today",
  "Explain today's revenue leakage",
  "Which companies have repeated compliance violations?",
  "Compare Apapa and Tin Can congestion",
  "Show cargo linked to Oceanic Lines",
  "Which manifests have duplicate submissions?",
  "Show every vessel owned by Oceanic Lines that entered Nigeria carrying petroleum products",
];

interface MissionStat {
  label: string;
  value: string;
  confidence: "verified" | "observed" | "inferred" | "unconfirmed";
  hint?: string;
}

const MISSION_STATS: MissionStat[] = [
  { label: "National Maritime Risk", value: "MEDIUM", confidence: "inferred", hint: "Composite of arrivals, alerts, revenue-at-risk" },
  { label: "Today's Alerts", value: "42", confidence: "verified" },
  { label: "Revenue at Risk", value: "₦1.24B", confidence: "inferred" },
  { label: "Recovered Today", value: "₦186M", confidence: "verified" },
  { label: "Open Investigations", value: "27", confidence: "verified" },
  { label: "AI Confidence", value: "82%", confidence: "observed" },
];

interface TimelineEvent {
  time: string;
  title: string;
  risk?: "HIGH" | "MEDIUM" | "LOW";
}
const INITIAL_TIMELINE: TimelineEvent[] = [
  { time: "07:12", title: "MV Ocean Pearl AIS gap observed — 6h off Bonny", risk: "HIGH" },
  { time: "08:45", title: "5 duplicate BOL manifests detected at Apapa", risk: "HIGH" },
  { time: "09:20", title: "Revenue-at-risk delta +₦180M vs 7d average", risk: "MEDIUM" },
  { time: "10:04", title: "3 seal-integrity mismatches — Tin Can gate", risk: "HIGH" },
  { time: "10:45", title: "Ownership cluster observed: Oceanic × Bluewave", risk: "MEDIUM" },
  { time: "11:12", title: "Historical match 82% on VOY-2411-A", risk: "LOW" },
];

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function CommandCenter() {
  const [askOpen, setAskOpen] = useState(false);
  const [seedQuery, setSeedQuery] = useState("");
  const [seedMode, setSeedMode] = useState<CopilotMode | undefined>();
  const [timeline, setTimeline] = useState<TimelineEvent[]>(INITIAL_TIMELINE);

  const openAsk = (q: string, mode?: CopilotMode) => {
    setSeedQuery(q);
    setSeedMode(mode);
    setAskOpen(true);
  };

  const pushTimeline = (e: TimelineEvent) => setTimeline((t) => [e, ...t]);


  return (
    <AppShell title="Command Center" subtitle="Mission Control AI" mode="light">
      <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        {/* Header banner */}
        <section className="rounded-xl border border-line bg-gradient-to-r from-primary/10 via-surface to-surface p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="type-h1 text-foreground">Maritime Intelligence Command Center</h1>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "#7C3AED", backgroundColor: "#7C3AED22" }}>
                  BETA
                </span>
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-green)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-green)]" />
                  Live
                </span>
              </div>
              <p className="mt-1 text-[13px] text-slate">
                Search · Retrieve · Interpret · Advise. One AI orchestrating every intelligence centre.
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* 4 mode cards */}
            <section>
              <h2 className="type-h2 mb-3 text-foreground">Intelligence modes</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {COPILOT_MODES.map((m) => {
                  const Icon = MODE_ICON[m.key];
                  return (
                    <button
                      key={m.key}
                      onClick={() => openAsk("", m.key)}
                      className="group rounded-xl border border-line bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40"
                    >
                      <div className="flex items-center gap-2">
                        <ModeBadge mode={m.key} />
                        <span className="ml-auto text-[10px] text-slate">{m.ordinal}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="type-h2 text-foreground">{m.key}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-slate">{m.question}</p>
                      <ul className="mt-2 space-y-0.5 text-[10.5px] text-slate">
                        {m.capabilities.slice(0, 4).map((c) => (
                          <li key={c}>· {c}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Try these intelligence queries */}
            <PanelCard className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="type-h2 text-foreground">Try these intelligence queries</h2>
                <span className="text-[10.5px] text-slate">Populate & execute in one click</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TRY_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => openAsk(q)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] text-foreground/85 hover:bg-surface-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </PanelCard>

            {/* Upload Manifest workflow */}
            <UploadManifestPanel onProcessed={pushTimeline} />

            {/* Intelligence timeline */}
            <PanelCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="type-h2 text-foreground">Intelligence timeline</h2>
                <ConfidenceChip tier="observed" />
              </div>
              <ol className="relative border-l border-line pl-4">
                {timeline.map((e, i) => (

                  <li key={i} className="mb-3 last:mb-0">
                    <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                    <div className="flex items-center gap-2">
                      <span className="type-mono text-[11px] text-slate">{e.time}</span>
                      {e.risk && <RiskPill level={e.risk} />}
                    </div>
                    <div className="text-[12.5px] text-foreground">{e.title}</div>
                  </li>
                ))}
              </ol>
            </PanelCard>

            {/* Copilot orchestration map */}
            <PanelCard className="p-4">
              <h2 className="type-h2 mb-2 text-foreground">Copilot orchestration</h2>
              <p className="mb-3 text-[12px] text-slate">
                Mission Control routes officer questions to the right Copilot instance. Every
                Copilot follows the same behaviour contract; only the domain differs.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {Object.values(COPILOT_REGISTRY).map((c) => (
                  <a
                    key={c.key}
                    href={c.workspace}
                    className="rounded-lg border border-line bg-surface/60 p-3 hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[12.5px] font-semibold text-foreground">{c.name}</span>
                      <span
                        className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: "#7C3AED", backgroundColor: "#7C3AED22" }}
                      >
                        BETA
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate">{c.scope}</p>
                  </a>
                ))}
              </div>
            </PanelCard>
          </div>

          {/* Mission Status side panel */}
          <aside className="space-y-3">
            <PanelCard className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="type-h2 text-foreground">Mission status</h2>
                <span className="inline-flex items-center gap-1 rounded bg-[color:var(--color-green)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--color-green)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-green)]" />
                  Live
                </span>
              </div>
              <ul className="space-y-2">
                {MISSION_STATS.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-start justify-between gap-2 rounded-md bg-surface/60 px-2.5 py-2"
                  >
                    <div>
                      <div className="text-[10.5px] uppercase tracking-[0.08em] text-slate">
                        {s.label}
                      </div>
                      <div className="text-[15px] font-bold text-foreground">{s.value}</div>
                      {s.hint && <div className="text-[10px] text-slate">{s.hint}</div>}
                    </div>
                    <ConfidenceChip tier={s.confidence} size={9} />
                  </li>
                ))}
              </ul>
            </PanelCard>
          </aside>
        </div>
      </div>

      <AskCopilotDialog
        instance="seaphore"
        open={askOpen}
        onOpenChange={setAskOpen}
        seedQuery={seedQuery}
      />
    </AppShell>
  );
}

/**
 * Upload Manifest workflow — CC-2: PDF/JPG/PNG/Excel → OCR → AI validation
 * → Risk scoring. Result routes to Manifest Intelligence. Uses mock
 * deterministic scoring until OCR service is wired.
 */
type StageKey = "ocr" | "validation" | "scoring";
type StageStatus = "idle" | "running" | "done" | "error";
interface StageState {
  status: StageStatus;
  progress: number; // 0..100
  detail?: string;
  error?: string;
}

type ConfidenceTier = "verified" | "observed" | "inferred" | "unconfirmed";
interface ManifestPreview {
  bol: string;
  vessel: string;
  voyage: string;
  consignee: string;
  shipper: string;
  portOfLoading: string;
  portOfDischarge: string;
  fields: { label: string; value: string; confidence: ConfidenceTier; note?: string }[];
  flags: { severity: "info" | "warn" | "risk"; text: string }[];
}

function buildPreview(file: File, risk: "HIGH" | "MEDIUM" | "LOW"): ManifestPreview {
  const seed = file.name.length;
  const bol = `BOL-${String(2400 + (seed % 900)).padStart(4, "0")}-NG`;
  const voyage = `VOY-${2411 + (seed % 12)}-${String.fromCharCode(65 + (seed % 6))}`;
  const vessel = ["MV Ocean Pearl", "MV Bluewave Star", "MV Sahara Trader", "MV Gulf Runner"][seed % 4];
  const consignee = ["Zenith Petrochem Ltd", "Delta Cargo Nigeria", "Apex Freight WA", "Oceanic Lines Nig."][seed % 4];
  const shipper = ["Rotterdam Bulk BV", "Antwerp Merchants NV", "Fujairah Trading FZE", "Singapore Marine Pte"][seed % 4];
  const pol = ["Rotterdam", "Antwerp", "Fujairah", "Singapore"][seed % 4];
  const pod = ["Apapa (Lagos)", "Tin Can (Lagos)", "Onne", "Port Harcourt"][seed % 4];
  const hs = ["2710.19", "3901.10", "8481.80"].slice(0, 1 + (seed % 3));
  return {
    bol, vessel, voyage, consignee, shipper, portOfLoading: pol, portOfDischarge: pod,
    fields: [
      { label: "Bill of lading", value: bol, confidence: "verified", note: "OCR match · header block" },
      { label: "Vessel", value: vessel, confidence: "verified", note: "Cross-checked against AIS registry" },
      { label: "Voyage", value: voyage, confidence: "observed" },
      { label: "Consignee", value: consignee, confidence: risk === "HIGH" ? "unconfirmed" : "observed", note: risk === "HIGH" ? "No prior filings under this TIN" : undefined },
      { label: "Shipper", value: shipper, confidence: "observed" },
      { label: "Port of loading", value: pol, confidence: "verified" },
      { label: "Port of discharge", value: pod, confidence: "verified" },
      { label: "HS codes", value: hs.join(" · "), confidence: "inferred", note: "Derived from cargo descriptions" },
      { label: "Line items", value: "148", confidence: "verified" },
      { label: "Containers", value: String(6 + (seed % 5)), confidence: "verified" },
      { label: "Gross weight", value: `${(1240 + (seed % 400)).toLocaleString()} kg`, confidence: "observed" },
    ],
    flags: [
      { severity: "warn", text: "1 duplicate BOL candidate observed in last 30 days" },
      { severity: "info", text: "2 field mismatches vs prior manifest for same voyage" },
      ...(risk === "HIGH"
        ? [{ severity: "risk" as const, text: "Consignee has no verified filings — requires officer review" }]
        : []),
    ],
  };
}

const STAGE_META: { key: StageKey; label: string; running: string; done: string }[] = [
  { key: "ocr", label: "OCR extraction", running: "Reading pages…", done: "Text and tables extracted" },
  { key: "validation", label: "AI validation", running: "Cross-checking BOL, HS codes, consignee…", done: "Fields validated against reference data" },
  { key: "scoring", label: "Risk scoring", running: "Weighting anomalies & historical matches…", done: "Composite risk computed" },
];

const ACCEPTED_EXT = ["pdf", "jpg", "jpeg", "png", "xlsx", "xls"];
const MAX_MB = 20;

function initialStages(): Record<StageKey, StageState> {
  return {
    ocr: { status: "idle", progress: 0 },
    validation: { status: "idle", progress: 0 },
    scoring: { status: "idle", progress: 0 },
  };
}

function UploadManifestPanel({ onProcessed }: { onProcessed?: (e: TimelineEvent) => void }) {
  const [filename, setFilename] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<StageKey, StageState>>(initialStages);
  const [risk, setRisk] = useState<"HIGH" | "MEDIUM" | "LOW" | null>(null);
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [logged, setLogged] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const updateStage = (k: StageKey, patch: Partial<StageState>) =>
    setStages((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  const animateStage = (k: StageKey, durationMs: number, failAt?: number) =>
    new Promise<void>((resolve, reject) => {
      const start = performance.now();
      updateStage(k, { status: "running", progress: 0, detail: undefined, error: undefined });
      const tick = (now: number) => {
        const pct = Math.min(100, Math.round(((now - start) / durationMs) * 100));
        if (failAt !== undefined && pct >= failAt) {
          updateStage(k, { status: "error", progress: failAt });
          reject(new Error("stage_failed"));
          return;
        }
        updateStage(k, { progress: pct });
        if (pct >= 100) {
          updateStage(k, { status: "done", progress: 100 });
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });

  const runPipeline = async (file: File) => {
    setFilename(file.name);
    setRisk(null);
    setFatalError(null);
    setStages(initialStages());

    // Pre-flight validation — surfaces before any stage starts.
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.includes(ext)) {
      setFatalError(`Unsupported file type ".${ext}". Accepted: PDF, JPG, PNG, XLSX.`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFatalError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — exceeds ${MAX_MB} MB limit.`);
      return;
    }

    // Deterministic mock: filenames containing "corrupt" fail OCR;
    // "sanction" fails validation. Everything else succeeds.
    const lower = file.name.toLowerCase();
    const ocrFail = lower.includes("corrupt");
    const valFail = lower.includes("sanction");

    setRunning(true);
    try {
      await animateStage("ocr", 900, ocrFail ? 60 : undefined);
      if (ocrFail) throw { stage: "ocr", message: "OCR service could not read pages 3–5 (image quality too low)." };
      updateStage("ocr", { detail: "12 pages · 148 line-items · 3 HS-code groups" });

      await animateStage("validation", 900, valFail ? 45 : undefined);
      if (valFail) throw { stage: "validation", message: "Consignee matched sanctions watchlist — validation halted." };
      updateStage("validation", { detail: "2 field mismatches · 1 duplicate BOL candidate" });

      await animateStage("scoring", 700);
      const score = (file.name.length * 7) % 100;
      const level: "HIGH" | "MEDIUM" | "LOW" = score > 66 ? "HIGH" : score > 33 ? "MEDIUM" : "LOW";
      setRisk(level);
      updateStage("scoring", { detail: `Composite risk ${level} · score ${score}/100` });

      onProcessed?.({
        time: nowHHMM(),
        title: `Manifest ${file.name} processed — 148 line-items · 1 duplicate BOL candidate`,
        risk: level,
      });
    } catch (err) {
      const e = err as { stage?: StageKey; message?: string };
      const stage = e.stage ?? "ocr";
      updateStage(stage, { status: "error", error: e.message ?? "Pipeline error." });
      setFatalError(e.message ?? "Pipeline failed.");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setFilename(null);
    setStages(initialStages());
    setRisk(null);
    setFatalError(null);
    setRunning(false);
  };

  const retry = () => {
    // Retry by resetting stages; user re-uploads.
    setStages(initialStages());
    setFatalError(null);
    setRisk(null);
  };

  const started = filename !== null;
  const allDone = stages.ocr.status === "done" && stages.validation.status === "done" && stages.scoring.status === "done";

  return (
    <PanelCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="type-h2 text-foreground">Upload manifest</h2>
        <span className="text-[10.5px] text-slate">OCR → AI validation → Risk scoring</span>
      </div>

      {!started && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-surface/60 p-6 text-center hover:bg-surface-2">
          <Upload className="h-6 w-6 text-primary" />
          <div className="text-[13px] font-semibold text-foreground">
            Drop a manifest (PDF · JPG · PNG · XLSX)
          </div>
          <div className="text-[11px] text-slate">
            Max {MAX_MB} MB. Files are processed by OCR, validated, and risk-scored.
          </div>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runPipeline(f);
              e.target.value = "";
            }}
          />
          <span className="mt-1 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground">
            Choose file
          </span>
        </label>
      )}

      {started && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md bg-surface/60 px-2.5 py-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span className="truncate text-[12px] font-semibold text-foreground">{filename}</span>
            {running && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-slate">
                <Loader2 className="h-3 w-3 animate-spin" /> Processing
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {STAGE_META.map((m) => (
              <StageRow key={m.key} meta={m} state={stages[m.key]} />
            ))}
          </ul>

          {fatalError && (
            <div className="rounded-md border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-[color:var(--color-red)]" />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-[color:var(--color-red)]">
                    Pipeline halted
                  </div>
                  <div className="text-[11px] text-foreground/80">{fatalError}</div>
                </div>
                <button
                  onClick={retry}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-foreground/80 hover:bg-surface-2"
                >
                  <RotateCw className="h-3 w-3" /> Retry
                </button>
              </div>
            </div>
          )}

          {allDone && risk && (
            <div className="rounded-lg border border-line bg-surface/60 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[color:var(--color-green)]" />
                <span className="text-[12.5px] font-semibold text-foreground">Complete</span>
                <RiskPill level={risk} />
                <ConfidenceChip tier="inferred" size={9} />
              </div>
              <p className="mt-1 text-[11px] text-slate">
                Observed: 148 line-items · 3 HS codes · 1 duplicate BOL candidate. The officer decides.
              </p>
              <div className="mt-2 flex gap-2">
                <a
                  href="/manifest"
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground"
                >
                  Open in Manifest Intelligence
                </a>
                <button
                  onClick={reset}
                  className="rounded-md border border-line px-3 py-1.5 text-[11.5px] font-semibold text-foreground/80 hover:bg-surface-2"
                >
                  Upload another
                </button>
              </div>
            </div>
          )}

          {!running && !allDone && !fatalError && (
            <button
              onClick={reset}
              className="rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold text-foreground/80 hover:bg-surface-2"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </PanelCard>
  );
}

function StageRow({
  meta,
  state,
}: {
  meta: { key: StageKey; label: string; running: string; done: string };
  state: StageState;
}) {
  const barColor =
    state.status === "error"
      ? "var(--color-red)"
      : state.status === "done"
        ? "var(--color-green)"
        : "var(--color-blue)";
  const caption =
    state.status === "error"
      ? state.error ?? "Failed"
      : state.status === "done"
        ? state.detail ?? meta.done
        : state.status === "running"
          ? meta.running
          : "Waiting";
  return (
    <li className="rounded-md border border-line bg-surface/40 px-2.5 py-2">
      <div className="flex items-center gap-2 text-[12px]">
        {state.status === "done" && <CheckCircle2 className="h-4 w-4 text-[color:var(--color-green)]" />}
        {state.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {state.status === "error" && <AlertTriangle className="h-4 w-4 text-[color:var(--color-red)]" />}
        {state.status === "idle" && <span className="h-3.5 w-3.5 rounded-full border-2 border-line" />}
        <span className="font-semibold text-foreground">{meta.label}</span>
        <span className="ml-auto tabular-nums text-[10.5px] text-slate">
          {state.status === "idle" ? "—" : `${state.progress}%`}
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-150 ease-out"
          style={{ width: `${state.progress}%`, backgroundColor: barColor }}
        />
      </div>
      <div
        className={
          "mt-1 text-[10.5px] " +
          (state.status === "error" ? "text-[color:var(--color-red)]" : "text-slate")
        }
      >
        {caption}
      </div>
    </li>
  );
}

