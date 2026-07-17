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
const TIMELINE: TimelineEvent[] = [
  { time: "07:12", title: "MV Ocean Pearl AIS gap observed — 6h off Bonny", risk: "HIGH" },
  { time: "08:45", title: "5 duplicate BOL manifests detected at Apapa", risk: "HIGH" },
  { time: "09:20", title: "Revenue-at-risk delta +₦180M vs 7d average", risk: "MEDIUM" },
  { time: "10:04", title: "3 seal-integrity mismatches — Tin Can gate", risk: "HIGH" },
  { time: "10:45", title: "Ownership cluster observed: Oceanic × Bluewave", risk: "MEDIUM" },
  { time: "11:12", title: "Historical match 82% on VOY-2411-A", risk: "LOW" },
];

function CommandCenter() {
  const [askOpen, setAskOpen] = useState(false);
  const [seedQuery, setSeedQuery] = useState("");
  const [seedMode, setSeedMode] = useState<CopilotMode | undefined>();

  const openAsk = (q: string, mode?: CopilotMode) => {
    setSeedQuery(q);
    setSeedMode(mode);
    setAskOpen(true);
  };

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
            <UploadManifestPanel />

            {/* Intelligence timeline */}
            <PanelCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="type-h2 text-foreground">Intelligence timeline</h2>
                <ConfidenceChip tier="observed" />
              </div>
              <ol className="relative border-l border-line pl-4">
                {TIMELINE.map((e, i) => (
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
function UploadManifestPanel() {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [filename, setFilename] = useState<string | null>(null);
  const [risk, setRisk] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");

  const process = (name: string) => {
    setFilename(name);
    setStep(1);
    setTimeout(() => setStep(2), 700);
    setTimeout(() => {
      // Deterministic mock risk score.
      const score = (name.length * 7) % 100;
      setRisk(score > 66 ? "HIGH" : score > 33 ? "MEDIUM" : "LOW");
      setStep(3);
    }, 1400);
  };

  const reset = () => {
    setStep(0);
    setFilename(null);
  };

  return (
    <PanelCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="type-h2 text-foreground">Upload manifest</h2>
        <span className="text-[10.5px] text-slate">OCR → AI validation → Risk scoring</span>
      </div>

      {step === 0 && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-surface/60 p-6 text-center hover:bg-surface-2">
          <Upload className="h-6 w-6 text-primary" />
          <div className="text-[13px] font-semibold text-foreground">
            Drop a manifest (PDF · JPG · PNG · XLSX)
          </div>
          <div className="text-[11px] text-slate">
            Files are processed by the OCR service, then validated and risk-scored.
          </div>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) process(f.name);
            }}
          />
          <span className="mt-1 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground">
            Choose file
          </span>
        </label>
      )}

      {step > 0 && (
        <div className="space-y-2">
          <Step label="OCR extraction" done={step >= 1} active={step === 1} />
          <Step label="AI validation" done={step >= 2} active={step === 2} />
          <Step label="Risk scoring" done={step >= 3} active={step === 3} />
        </div>
      )}

      {step === 3 && filename && (
        <div className="mt-3 rounded-lg border border-line bg-surface/60 p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-[12.5px] font-semibold text-foreground">{filename}</span>
            <RiskPill level={risk} />
            <ConfidenceChip tier="inferred" size={9} />
          </div>
          <p className="mt-1 text-[11px] text-slate">
            Observed: 12 line-items · 3 HS codes · 1 duplicate BOL candidate. The officer decides.
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
    </PanelCard>
  );
}

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      {done && !active ? (
        <CheckCircle2 className="h-4 w-4 text-[color:var(--color-green)]" />
      ) : (
        <span
          className={
            "h-3.5 w-3.5 rounded-full border-2 " +
            (active ? "border-primary bg-primary/30 animate-pulse" : "border-line")
          }
        />
      )}
      <span className={done ? "text-foreground" : "text-slate"}>{label}</span>
    </div>
  );
}
