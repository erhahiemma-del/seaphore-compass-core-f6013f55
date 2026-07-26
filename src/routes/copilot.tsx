/**
 * /copilot — NIMASA Copilot Intelligence Operations Center.
 *
 * Presentation layer only. All backend engines (Orchestrator, Agents,
 * Fusion, Reasoning, Policy, Workflow, Adaptive Briefing) are reused
 * verbatim through `copilotQueryFn` and `copilotOverrideFn`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Anchor,
  Building2,
  ClipboardCheck,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Gavel,
  Layers,
  Loader2,
  MapPin,
  Package,
  Pin,
  Plus,
  Radar,
  Search,
  Send,
  ShieldCheck,
  Ship,
  Sparkles,
  Split,
  TrendingDown,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdaptiveBriefing } from "@/components/copilot/briefing";
import type {
  AdaptiveBriefingData,
  OverrideSubmission,
} from "@/components/copilot/briefing";
import { StreamingStages } from "@/components/copilot/StreamingStages";
import { InvestigationLanding } from "@/components/copilot/InvestigationLanding";
import {
  describeAttachments,
  type OfficerAttachment,
} from "@/hooks/use-officer-attachments";


import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Button } from "@/components/ui/button";
import { adaptBriefing, type CopilotQueryResponse } from "@/lib/copilot/adapt-briefing";
import { exportBriefingToPdf } from "@/lib/copilot/export-briefing-pdf";
import { getIntelligenceMetrics } from "@/lib/intelligence-metrics.functions";
import { copilotOverrideFn } from "@/lib/orchestration.functions";
import { runOIEFn } from "@/lib/oie/oie.functions";
import { cn } from "@/lib/utils";
import { captureOverride } from "@/services/orchestration";
import { runOIE, type Clarification } from "@/services/oie";
import { enhanceWithIBE, persistHypotheses } from "@/services/ibe";
import { IntelligenceProjectionPanel } from "@/components/copilot/projection/IntelligenceProjectionPanel";
import { ExecutiveBriefing } from "@/components/copilot/briefing/ExecutiveBriefing";
import { EvidenceProvenancePanel } from "@/components/copilot/briefing/EvidenceProvenancePanel";
import { useUipStore } from "@/stores/uip.store";
import { synthesizeExecutiveBrief } from "@/lib/copilot/executive-brief/synthesize";

import { analyzeOperationalKnowledge } from "@/services/okl";
import { autoIngestOklIntoInvestigations } from "@/services/okl/auto-ingest";
import type { HumanResponse } from "@/services/oie/types";
import type { IbeResult } from "@/services/ibe/types";
import { ClarifyCard } from "@/components/copilot/ClarifyCard";
import { useAuthStore } from "@/stores/auth.store";
import { useCopilotStore } from "@/stores/copilot.store";
import { useIsDevBypass } from "@/stores/dev-mode.store";
import { useMissionContextStore } from "@/stores/mission-context.store";
import { useWorkspaceStore } from "@/stores/workspace.store";
import { buildLineageTrace } from "@/lib/lineage/build-lineage";
import { useCopilotSession } from "@/hooks/use-copilot-session";
import {
  COPILOT_COMMANDS,
  evaluateAvailability,
  type CommandExecutionContext,
  type CommandPermission,
} from "@/services/copilot/commands/registry";
import { routeCommand } from "@/services/copilot/commands/router";
import { recordBriefingToWorkspace, recordOfficerTurn } from "@/services/workspace/derive";


export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "NIMASA Copilot — Maritime Intelligence Operations" },
      {
        name: "description",
        content:
          "Officer-facing intelligence operations center powered by the Seaphore Orchestration Engine.",
      },
    ],
  }),
  component: CopilotOpsPage,
});

type Stage = "idle" | "classifying" | "retrieving" | "reasoning" | "rendering" | "ready";

interface Investigation {
  id: string;
  title: string;
  subtitle: string;
  pinned?: boolean;
  when: string;
}

const PINNED: Investigation[] = [
  { id: "inv-ocean-pearl", title: "MV Ocean Pearl", subtitle: "High risk investigation", when: "10:45", pinned: true },
  { id: "inv-revenue-lagos", title: "Revenue leakage — Lagos", subtitle: "Analysis", when: "09:32", pinned: true },
];

const RECENT: Investigation[] = [
  { id: "inv-ais-niger", title: "AIS blackout — MT Niger Runner", subtitle: "Detect", when: "18:11" },
  { id: "inv-tin-can", title: "Duplicate manifests — Tin Can", subtitle: "Investigate", when: "17:48" },
  { id: "inv-blue-horizon", title: "Sanctions screening — Blue Horizon", subtitle: "Compliance", when: "17:02" },
  { id: "inv-apapa", title: "Port congestion — Apapa", subtitle: "Ports", when: "16:40" },
  { id: "inv-imo-942", title: "Unusual voyage pattern — IMO 942…", subtitle: "Vessel", when: "15:22" },
];




interface OrchestrationModule {
  key: string;
  label: string;
  route: string;
  icon: LucideIcon;
}

/**
 * Intelligence modules that Copilot can orchestrate. Clicking "Open"
 * navigates to the module (nav + Copilot launcher stay persistent).
 * Clicking "Split" mounts the module in an embedded iframe beside the
 * Copilot workspace so officers can cross-reference without losing
 * conversation context.
 */
const ORCHESTRATION_MODULES: OrchestrationModule[] = [
  { key: "manifest", label: "Manifest", route: "/manifest", icon: FileText },
  { key: "revenue", label: "Revenue", route: "/revenue", icon: DollarSign },
  { key: "vessel", label: "Vessel", route: "/vessel", icon: Ship },
  { key: "ownership", label: "Ownership", route: "/ownership", icon: Building2 },
  { key: "ports", label: "Ports", route: "/ports", icon: Anchor },
  { key: "compliance", label: "Compliance", route: "/compliance", icon: ShieldCheck },
  { key: "detect", label: "Detect", route: "/detect", icon: Radar },
  { key: "investigate", label: "Investigate", route: "/investigate", icon: Search },
  { key: "decide", label: "Decision Support", route: "/decide", icon: Gavel },
];

function CopilotOpsPage() {
  const queryClient = useQueryClient();
  const context = useCopilotStore((s) => s.context);
  const runOIEServer = useServerFn(runOIEFn);
  const submitOverride = useServerFn(copilotOverrideFn);
  const devBypass = useIsDevBypass();
  const authUserId = useAuthStore((s) => s.officer?.userId);
  const officerId = authUserId ?? "00000000-0000-0000-0000-000000000000";
  const session = useCopilotSession();
  const activeMissionId = useMissionContextStore((s) => s.activeId);
  const activeMission = useMissionContextStore((s) =>
    s.activeId ? s.missions[s.activeId] ?? null : null,
  );

  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [briefing, setBriefing] = useState<AdaptiveBriefingData | null>(null);
  const [uipId, setUipId] = useState<string | null>(null);

  const [lineage, setLineage] = useState<import("@/lib/lineage/types").LineageTrace | null>(null);
  const [ibeProjection, setIbeProjection] = useState<{
    ibe: import("@/services/ibe/types").IbeResult["ibe"] | null;
    humanResponse: import("@/services/oie/types").HumanResponse | null;
    briefingId?: string;
  } | null>(null);
  const [clarify, setClarify] = useState<Clarification | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeInvestigation, setActiveInvestigation] = useState<string>("inv-ocean-pearl");
  const [panelTab, setPanelTab] = useState<"context" | "evidence" | "timeline" | "notes">("context");
  const [splitModule, setSplitModule] = useState<OrchestrationModule | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, []);


  const mutation = useMutation({
    mutationFn: async (q: string) => {
      setError(null);
      setClarify(null);
      setStage("classifying");
      const started = performance.now();
      await new Promise((r) => setTimeout(r, 60));
      setStage("retrieving");

      const missionState = useMissionContextStore.getState();
      const mission = activeMissionId ? missionState.missions[activeMissionId] : undefined;
      const payload = {
        query: q,
        officer_id: officerId,
        mission: mission as unknown as Record<string, unknown> | undefined,
        context: context
          ? {
              investigation_id: context.kind === "investigation" ? context.label : undefined,
              vessel: context.kind === "vessel" ? context.label : undefined,
              port: context.kind === "port" ? context.label : undefined,
            }
          : undefined,
      };

      const rawResult = devBypass
        ? await runOIE({
            query: {
              query: payload.query,
              officer_id: payload.officer_id,
              mission: payload.mission,
              context: payload.context,
            },
          })
        : await runOIEServer({ data: payload });

      // The server function returns a flattened briefing shape for wire
      // efficiency. Rehydrate it into the canonical OIEResult that IBE
      // expects. `devBypass` already returns the canonical shape.
      // Also register the Canonical UIP in the client store so every
      // downstream surface can resolve evidence via getUip(source_uip_id).
      const uipFromResult = (rawResult as { uip?: unknown }).uip as
        | import("@/services/ife/unified").UnifiedIntelligencePackage
        | null
        | undefined;
      if (uipFromResult && uipFromResult.id) {
        (
          await import("@/stores/uip.store")
        ).useUipStore.getState().register(uipFromResult);
        setUipId(uipFromResult.id);
      } else {
        setUipId(null);
      }


      const normalisedResult: import("@/services/oie").OIEResult = (() => {
        if ((rawResult as { briefing?: unknown }).briefing) {
          return rawResult as unknown as import("@/services/oie").OIEResult;
        }
        const r = rawResult as Record<string, unknown>;
        if (r.kind === "clarify") {
          return {
            kind: "clarify",
            clarification: r.clarification as never,
            interpreted: r.interpreted as never,
            latencyMs: (r.latency_ms as number) ?? 0,
          };
        }
        return {
          kind: "briefing",
          briefing: {
            id: (r.briefing_id as string) ?? `brf-${Date.now()}`,
            session_id: undefined,
            officer_id: officerId,
            query: q,
            workspace: undefined,
            investigation_id: undefined,
            mode: r.mode as never,
            classification: r.classification as never,
            sections: (r.sections as never) ?? [],
            intelligence_status: r.intelligence_status as never,
            sources_queried: (r.sources_queried as number) ?? 0,
            sources_responded: (r.sources_responded as number) ?? 0,
            sources_corroborated: (r.sources_corroborated as number) ?? 0,
            confidence_matrix: r.confidence_matrix as never,
            latency_ms: (r.latency_ms as number) ?? 0,
            model_used: "server",
          },
          humanResponse: r.humanResponse as never,
          plan: r.plan as never,
          provider: r.provider as never,
          latencyMs: (r.latency_ms as number) ?? 0,
        };
      })();

      // Sprint COPILOT-2.0 — Intelligence Behaviour Engine.
      // OIE has produced an operational briefing. IBE reshapes it so the
      // Copilot speaks as a senior maritime intelligence officer: mission
      // aware, hypothesis-tracking, coaching, and always initiative-led.
      const result = enhanceWithIBE({
        query: q,
        mission: mission ?? null,
        result: normalisedResult,
      });
      if (result.kind === "briefing" && result.ibe) {
        persistHypotheses(activeMissionId, result.ibe.hypotheses);
      }

      setStage("reasoning");

      if (result.kind === "clarify") {
        setClarify(result.clarification);
        setBriefing(null);
        setLineage(null);
        setIbeProjection(null);
        setFollowUps([]);
        setStage("ready");
        return null;
      }

      // Normalise both shapes into a CopilotQueryResponse for the adapter.
      const flat = (() => {
        if ("briefing" in result && result.briefing) {
          const b = result.briefing;
          return {
            briefing_id: b.id,
            classification: b.classification,
            sections: b.sections,
            intelligence_status: b.intelligence_status,
            sources_queried: b.sources_queried,
            sources_responded: b.sources_responded,
            sources_corroborated: b.sources_corroborated,
            mode: b.mode,
            latency_ms: b.latency_ms,
          } as CopilotQueryResponse;
        }
        return result as unknown as CopilotQueryResponse;
      })();

      const adapted = adaptBriefing(
        { ...flat, latency_ms: flat.latency_ms ?? Math.round(performance.now() - started) },
        q,
      );
      setStage("rendering");
      setBriefing(adapted);
      // Assemble the Evidence Lineage Trace from existing artefacts (OIE
      // citations, IBE hypotheses, mission context, workspace state). This
      // projects backend intelligence into an officer-facing chain-of-custody.
      try {
        const wsState = useWorkspaceStore.getState();
        const activeWs = wsState.activeId ? wsState.investigations[wsState.activeId] : null;
        const humanResponse =
          (result as { humanResponse?: import("@/services/oie/types").HumanResponse })
            .humanResponse ?? result.ibe?.humanResponse;
        setLineage(
          buildLineageTrace({
            briefing: adapted,
            humanResponse,
            hypotheses: result.ibe?.hypotheses,
            mission: mission ?? null,
            workspace: activeWs,
          }),
        );
      } catch (e) {
        console.warn("[Lineage] failed to build trace", e);
        setLineage(null);
      }
      // Sprint UX-007 — Intelligence Projection Framework. Expose the IBE
      // internal state (stage, hypotheses, nudges, contract) as an
      // officer-facing panel so nothing important happens silently.
      try {
        const humanResp =
          (result as { humanResponse?: import("@/services/oie/types").HumanResponse })
            .humanResponse ?? result.ibe?.humanResponse ?? null;
        setIbeProjection({
          ibe: result.ibe ?? null,
          humanResponse: humanResp,
          briefingId: adapted.id,
        });
      } catch (e) {
        console.warn("[IPF] failed to project IBE", e);
        setIbeProjection(null);
      }
      const plan = (result as { plan?: { followUps?: string[] } }).plan;
      const ibeQuestions = result.ibe?.humanResponse?.suggestedNextQuestions;
      setFollowUps(ibeQuestions?.length ? ibeQuestions : plan?.followUps ?? []);
      setStage("ready");
      session.appendCopilot(`Briefing: ${q}`, adapted.id);
      // Sprint UX-005 — persist briefing into the Investigation Workspace.
      // The active UIP id (captured above from the OIE result) is threaded
      // through so the Investigation permanently references the originating
      // Canonical UIP — mandatory for the operational-runtime pipeline
      // (UIP → OSAE → Investigation → Mission → MIBC).
      try {
        recordBriefingToWorkspace(adapted, uipFromResult?.id ?? null);
      } catch (e) {
        console.warn("[Workspace] failed to record briefing", e);
      }
      await queryClient.invalidateQueries({ queryKey: ["intel", "briefings"] });
      return adapted;
    },
    onError: (err: unknown, variables) => {
      setStage("idle");
      setError(err instanceof Error ? err.message : "Copilot request failed");
      if (typeof variables === "string" && variables.trim()) setText(variables);
      console.error("[Copilot] OIE run failed", err);
    },
  });

  function handleSubmit(q: string, attachments?: OfficerAttachment[]) {
    const clean = q.trim();
    if (!clean || mutation.isPending) return;
    setText("");
    setError(null);
    setClarify(null);
    // Officer-attached manifests/documents travel with the query as
    // officer-supplied context — the pipeline stays the single path.
    const context = attachments?.length ? describeAttachments(attachments) : "";
    const submitted = context ? `${clean}\n\n${context}` : clean;
    try {
      session.appendOfficer(submitted);
    } catch (err) {
      console.warn("[Copilot] failed to log officer turn", err);
    }
    // Sprint UX-005 — record officer turn into the Investigation Workspace.
    try {
      recordOfficerTurn(submitted);
    } catch (err) {
      console.warn("[Workspace] failed to record officer turn", err);
    }
    // Scroll the workspace so the officer sees streaming stages / new briefing
    // instead of the (now stale) previous briefing content above.
    requestAnimationFrame(() => {
      workspaceScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    mutation.mutate(submitted);
  }


  async function handleOverride(submission: OverrideSubmission) {
    if (!briefing) return;
    try {
      if (devBypass) {
        await captureOverride({
          briefing_id: briefing.id,
          officer_id: officerId,
          decision: submission.decision,
          justification: submission.justification,
        });
      } else {
        await submitOverride({
          data: {
            briefing_id: briefing.id,
            decision: submission.decision,
            justification: submission.justification,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override submission failed");
    }
  }

  const isStreaming =
    stage === "classifying" || stage === "retrieving" || stage === "reasoning" || stage === "rendering";

  /**
   * Sprint UX-02 — the workspace has two modes. Empty state = the
   * Investigation Landing (hero prompt, centred). Investigation Mode =
   * briefing above, input docked to the bottom. Same submit path.
   */
  const investigationMode = Boolean(briefing) || isStreaming || Boolean(clarify) || Boolean(error);
  const subjectLabel = (context?.label ?? "MV Ocean Pearl").split("·")[0]!.trim();


  return (
    <AppShell title="NIMASA Copilot" subtitle="Intelligence Orchestration Workspace">
      <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-[#F7F8FA]">
        {/* Module Orchestration Bar — persistent switcher across every
            intelligence module. "Open" navigates (Copilot launcher stays
            available via the global sidebar); "Split" mounts the module
            beside the workspace so context is never lost. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-white px-4 py-2">
          <div className="mr-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
            Orchestrate
          </div>
          {ORCHESTRATION_MODULES.map((m) => {
            const active = splitModule?.key === m.key;
            return (
              <div key={m.key} className="flex items-center overflow-hidden rounded-md border border-border/70">
                <Link
                  to={m.route}
                  className="flex items-center gap-1.5 bg-background px-2 py-1 text-[11.5px] font-medium text-foreground hover:bg-accent"
                >
                  <m.icon className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
                  {m.label}
                </Link>
                <button
                  type="button"
                  onClick={() => setSplitModule(active ? null : m)}
                  title={active ? "Close split view" : "Open in split view"}
                  className={cn(
                    "flex items-center border-l border-border/70 px-1.5 py-1 text-muted-foreground hover:text-foreground",
                    active && "bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]",
                  )}
                >
                  <Split className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* KPI Ribbon */}
        <KpiRibbon />

        {/* Main area — 3 columns; when a module is split-mounted the center
            workspace shrinks and the module renders beside it. */}
        <div
          className={cn(
            "grid flex-1 gap-4 p-4",
            splitModule
              ? "lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]"
              : "lg:grid-cols-[280px_minmax(0,1fr)_360px]",
          )}
        >
          {/* LEFT — Investigations */}
          <aside className="flex flex-col gap-3">
            <div className="rounded-xl border border-border/60 bg-white shadow-sm">
              <div className="flex border-b border-border/60 px-3 pt-2">
                <TabBtn active>Investigations</TabBtn>
                <TabBtn>Cases</TabBtn>
              </div>
              <div className="p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    placeholder="Search investigations…"
                    className="w-full rounded-md border border-border/70 bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary"
                  />
                </div>

                <SectionLabel className="mt-4">Pinned</SectionLabel>
                <ul className="space-y-1">
                  {PINNED.map((inv) => (
                    <InvestigationRow
                      key={inv.id}
                      inv={inv}
                      active={inv.id === activeInvestigation}
                      onClick={() => setActiveInvestigation(inv.id)}
                    />
                  ))}
                </ul>

                <SectionLabel className="mt-4">Recent</SectionLabel>
                <ul className="space-y-1">
                  {RECENT.map((inv) => (
                    <InvestigationRow
                      key={inv.id}
                      inv={inv}
                      active={inv.id === activeInvestigation}
                      onClick={() => setActiveInvestigation(inv.id)}
                    />
                  ))}
                </ul>




                <button
                  type="button"
                  onClick={() => {
                    setBriefing(null);
                    setLineage(null);
                    setIbeProjection(null);
                    setStage("idle");
                    setText("");
                    inputRef.current?.focus();
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-[12px] font-semibold text-muted-foreground hover:border-primary/60 hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> New Investigation
                </button>
              </div>
            </div>
          </aside>

          {/* CENTER — Intelligence Workspace */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-1 flex-col rounded-xl border border-border/60 bg-white shadow-sm">
              <div className="flex items-start justify-between border-b border-border/60 px-4 py-2.5">
                <div className="flex items-start gap-3 text-[12px]">
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-[color:var(--color-teal)]" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Current Investigation
                    </div>
                    <div className="text-[13px] font-semibold text-foreground">
                      {context?.label ?? "MV Ocean Pearl · IMO 9438291"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                        Active
                      </span>
                      <span className="text-muted-foreground">
                        Mission ·{" "}
                        <span className="font-medium text-foreground">
                          {briefing?.query ? "Intelligence briefing" : "Awaiting Investigation"}
                        </span>
                      </span>

                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => briefing && exportBriefingToPdf(briefing)}
                    disabled={!briefing || mutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground/80 hover:bg-accent disabled:opacity-50"
                    title="Download this briefing as a PDF for sharing and record-keeping"
                  >
                    <Download className="h-3 w-3" /> Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBriefing(null);
                      setLineage(null);
                      setIbeProjection(null);
                      setStage("idle");
                      setText("");
                      setError(null);
                      inputRef.current?.focus();
                    }}
                    disabled={mutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground/80 hover:bg-accent disabled:opacity-50"
                    title="Clear briefing and start a new discussion"
                  >
                    <Plus className="h-3 w-3" /> New Discussion
                  </button>
                  <Link
                    to="/workspace"
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground/80 hover:bg-accent"
                    title="Open the Investigation Workspace — persistent evidence, hypotheses, tasks and decisions"
                  >
                    Workspace
                  </Link>
                  <button className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground/80 hover:bg-accent">
                    Change Context
                  </button>
                </div>
              </div>

              <div
                ref={workspaceScrollRef}
                className={cn(
                  "flex-1 overflow-auto",
                  investigationMode ? "p-4" : "flex p-0",
                )}
              >
                {!investigationMode ? (
                  <InvestigationLanding
                    subject={subjectLabel}
                    value={text}
                    onChange={setText}
                    onSubmit={handleSubmit}
                    pending={mutation.isPending}
                    inputRef={inputRef}
                  />
                ) : null}


                {isStreaming ? (
                  <div className="rounded-lg border border-border/60 bg-[#FAFBFC] p-4">
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Query
                    </p>
                    <p className="mb-4 text-sm text-foreground">{mutation.variables ?? ""}</p>
                    <StreamingStages activeIndex={stageIndex(stage)} />
                  </div>
                ) : null}

                {error ? (
                  <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                {clarify ? (
                  <div className="mb-3">
                    <ClarifyCard clarification={clarify} onPick={(l) => handleSubmit(l)} />
                  </div>
                ) : null}

                {briefing ? (
                  <>
                    <IntelligenceProjectionPanel
                      ibe={ibeProjection?.ibe ?? null}
                      humanResponse={ibeProjection?.humanResponse ?? null}
                      mission={activeMission}
                      briefingId={ibeProjection?.briefingId}
                    />
                    <ExecutiveBriefingView
                      briefing={briefing}
                      humanResponse={ibeProjection?.humanResponse ?? null}
                      ibe={ibeProjection?.ibe ?? null}
                      followUps={followUps}
                      uipId={uipId}
                      onFollowUp={(q: string) => handleSubmit(q)}
                    />

                    <details className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-700 open:shadow-sm">
                      <summary className="cursor-pointer font-medium text-slate-800">
                        Analyst view — full adaptive briefing
                      </summary>
                      <div className="mt-3">
                        <AdaptiveBriefing
                          briefing={briefing}
                          lineage={lineage}
                          onOverride={handleOverride}
                          onGapRequest={(q) => handleSubmit(q)}
                          onNextQuestion={(q) => handleSubmit(q)}
                        />
                      </div>
                    </details>
                  </>
                ) : null}

                {briefing && followUps.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-border/60 bg-[#FAFBFC] p-3">
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Suggested next questions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {followUps.map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => handleSubmit(f)}
                        >
                          {f}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Investigation Mode — the input docks to the bottom and the
                  briefing grows above it. The officer never loses the input. */}
              {investigationMode ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit(text);
                  }}
                  className="animate-in slide-in-from-bottom-2 fade-in border-t border-border/60 bg-white px-4 py-3 duration-300"
                >
                  <div className="flex items-end gap-2 rounded-xl border border-border/70 bg-white px-3 py-2 shadow-sm transition-shadow focus-within:border-[color:var(--color-teal)]/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-teal)_12%,transparent)]">
                    <textarea
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={`Investigate ${subjectLabel}...`}
                      rows={1}
                      disabled={mutation.isPending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit(text);
                        }
                      }}
                      className="max-h-44 flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={mutation.isPending || !text.trim()}
                      className="h-8 gap-1.5"
                    >
                      {mutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Shift + Enter = New Line
                  </p>
                </form>
              ) : null}

            </div>
          </section>

          {/* RIGHT — Split module OR Intelligence Panel */}
          <aside className="flex flex-col gap-3">
            {splitModule ? (
              <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                    <splitModule.icon className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
                    {splitModule.label} Intelligence
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Split View
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      to={splitModule.route}
                      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/80 hover:bg-accent"
                      title="Open full page"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSplitModule(null)}
                      className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"
                      title="Close split view"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <iframe
                  key={splitModule.key}
                  src={`${splitModule.route}?embed=1`}
                  title={`${splitModule.label} Intelligence`}
                  className="min-h-[600px] flex-1 w-full border-0 bg-white"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-white shadow-sm">
                <div className="flex border-b border-border/60 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider">
                  {(["context", "evidence", "timeline", "notes"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setPanelTab(tab)}
                      className={cn(
                        "mr-3 border-b-2 pb-2 pt-1",
                        panelTab === tab
                          ? "border-[color:var(--color-teal)] text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab === "context" ? "Context" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="space-y-5 p-4">
                  <VesselSnapshot />
                  <RiskOverview />
                  <OwnershipGraph />
                  <CopilotCommandsPanel
                    onRun={handleSubmit}
                    vessel={context?.label ?? "MV Ocean Pearl"}
                    investigation={activeInvestigation}
                    hasIntelligencePackage={Boolean(briefing)}
                    role="officer"
                    disabled={mutation.isPending}
                  />
                </div>

              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- Executive Briefing wrapper ---------- */

function ExecutiveBriefingView({
  briefing,
  humanResponse,
  ibe,
  followUps,
  uipId,
  onFollowUp,
}: {
  briefing: AdaptiveBriefingData;
  humanResponse: HumanResponse | null;
  ibe: NonNullable<IbeResult["ibe"]> | null;
  followUps: string[];
  uipId: string | null;
  onFollowUp: (q: string) => void;
}) {
  // Resolve the Canonical UIP that produced this briefing so the
  // provenance panel + OKL analysis operate on the same evidence set
  // every downstream surface consumes. NEVER falls back to demo fixtures.
  const uip = useUipStore((s) => (uipId ? s.byId[uipId] : undefined));
  const operationalKnowledge = useMemo(
    () =>
      uip
        ? analyzeOperationalKnowledge({
            uip,
            rawEvidence: uip.rawEvidence,
            historical: [],
            investigations: [],
          })
        : null,
    [uip],
  );
  useEffect(() => {
    if (operationalKnowledge) autoIngestOklIntoInvestigations(operationalKnowledge);
  }, [operationalKnowledge]);
  const brief = useMemo(
    () =>
      synthesizeExecutiveBrief({
        briefing,
        humanResponse,
        ibe,
        followUps,
        operationalKnowledge: operationalKnowledge ?? undefined,
      }),
    [briefing, humanResponse, ibe, followUps, operationalKnowledge],
  );
  return (
    <>
      <ExecutiveBriefing brief={brief} onFollowUp={onFollowUp} />
      {uip && <EvidenceProvenancePanel uip={uip} />}
    </>
  );

}



function stageIndex(s: Stage): number {
  if (s === "classifying") return 0;
  if (s === "retrieving") return 1;
  if (s === "reasoning") return 2;
  return 3;
}

/* ---------- KPI Ribbon ---------- */

function KpiRibbon() {
  const fetchMetrics = useServerFn(getIntelligenceMetrics);
  const { data: metrics } = useQuery({
    queryKey: ["intel", "metrics"],
    queryFn: () => fetchMetrics(),
    staleTime: 60_000,
    retry: false,
  });

  const tiles = useMemo(
    () => [
      {
        icon: AlertTriangle,
        color: "#DC2626",
        label: "High Alerts",
        value: metrics?.risk?.value ? Math.max(1, Math.round((metrics.risk.value ?? 0) / 20)) : 5,
        delta: "+1",
      },
      {
        icon: Layers,
        color: "#0891B2",
        label: "Today's Manifests",
        value: metrics?.manifest?.display ?? "—",
        delta: "+12",
      },
      {
        icon: ClipboardCheck,
        color: "#F59E0B",
        label: "Pending Validation",
        value: metrics?.container?.value != null ? Math.min(999, Math.round(metrics.container.value / 4)) : "—",
        delta: "+6",
      },
      {
        icon: TrendingDown,
        color: "#DC2626",
        label: "Revenue At Risk",
        value: metrics?.revenue?.display ?? "—",
        delta: "+₦120M",
      },
      {
        icon: Gauge,
        color: "#10B981",
        label: "Confidence Score",
        value: metrics?.risk?.value != null ? `${Math.max(60, 100 - Math.round(metrics.risk.value))}%` : "82%",
        delta: "+1.4%",
      },
      {
        icon: FileText,
        color: "#2563EB",
        label: "Open Investigations",
        value: 12,
        delta: "+3",
      },
    ],
    [metrics],
  );

  return (
    <div className="grid grid-cols-2 gap-3 border-b border-border/60 bg-white p-4 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-border/60 bg-white px-3 py-2.5 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ backgroundColor: `${t.color}15`, color: t.color }}
            >
              <t.icon className="h-3.5 w-3.5" />
            </div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.label}
            </div>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-[22px] font-bold leading-none text-foreground">{t.value}</div>
            <div className="text-[11px] font-semibold text-[color:var(--color-teal)]">{t.delta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Left column helpers ---------- */

function TabBtn({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={cn(
        "mr-4 border-b-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider",
        active
          ? "border-[color:var(--color-teal)] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function InvestigationRow({
  inv,
  active,
  onClick,
}: {
  inv: Investigation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition",
          active
            ? "border-[color:var(--color-teal)]/40 bg-[color:var(--color-teal)]/5"
            : "border-transparent hover:bg-accent",
        )}
      >
        {inv.pinned ? (
          <Pin className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--color-teal)]" />
        ) : (
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12.5px] font-semibold text-foreground">{inv.title}</span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground">{inv.when}</span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{inv.subtitle}</div>
        </div>
      </button>
    </li>
  );
}




/* ---------- Right panel widgets ---------- */

function VesselSnapshot() {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Vessel Snapshot</SectionLabel>
        <button className="text-[10.5px] font-semibold text-[color:var(--color-teal)] hover:underline">
          View Full Profile
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[color:var(--color-navy)]/80 to-[color:var(--color-teal)]/70 text-white">
          <Ship className="h-8 w-8 opacity-80" />
        </div>
        <div className="space-y-1 p-3 text-[11.5px]">
          <div className="text-[13px] font-semibold text-foreground">MV Ocean Pearl</div>
          <Row label="IMO" value="9438291" />
          <Row label="MMSI" value="657123400" />
          <Row label="Flag" value="Panama" />
          <Row label="Vessel Type" value="General Cargo" />
          <Row label="GT / DWT" value="28,730 / 45,620" />
          <Row label="Operator" value="OceanLine Shipping SA" />
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}

function RiskOverview() {
  const rows = [
    { label: "Documentation Risk", level: "High", color: "#DC2626" },
    { label: "Ownership Risk", level: "High", color: "#DC2626" },
    { label: "Behavioral Risk", level: "Medium", color: "#F59E0B" },
    { label: "Compliance Risk", level: "High", color: "#DC2626" },
  ];
  return (
    <section>
      <SectionLabel>Risk Overview</SectionLabel>
      <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-[#DC2626]/20">
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent"
            style={{ borderTopColor: "#DC2626", borderRightColor: "#DC2626", transform: "rotate(45deg)" }}
          />
          <div className="text-center">
            <div className="text-lg font-bold leading-none text-[#DC2626]">78</div>
            <div className="text-[8px] font-semibold uppercase text-muted-foreground">High</div>
          </div>
        </div>
        <ul className="flex-1 space-y-1 text-[11.5px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-foreground/85">{r.label}</span>
              </span>
              <span className="font-semibold" style={{ color: r.color }}>
                {r.level}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function OwnershipGraph() {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Ownership Graph</SectionLabel>
        <button className="text-[10.5px] font-semibold text-[color:var(--color-teal)] hover:underline">
          View Full Graph
        </button>
      </div>
      <div className="space-y-2 rounded-lg border border-border/60 p-3 text-[11.5px]">
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
          <Users className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
          <div className="flex-1">
            <div className="font-semibold text-foreground">OceanLine Shipping SA</div>
            <div className="text-[10.5px] text-muted-foreground">Panama</div>
          </div>
          <span className="text-[10.5px] font-semibold text-muted-foreground">100%</span>
        </div>
        <div className="ml-4 flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
          <Users className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
          <div className="flex-1">
            <div className="font-semibold text-foreground">Blue Horizon Holdings Ltd</div>
            <div className="text-[10.5px] text-muted-foreground">BVI</div>
          </div>
        </div>
        <div className="ml-8 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border/60 bg-background/60 p-1.5">
            <div className="text-[10.5px] text-muted-foreground">60%</div>
            <div className="text-[11px] font-semibold text-foreground">Maritime Assets Inc.</div>
            <div className="text-[10px] text-muted-foreground">Liberia</div>
          </div>
          <div className="rounded-md border border-border/60 bg-background/60 p-1.5">
            <div className="text-[10.5px] text-muted-foreground">40%</div>
            <div className="text-[11px] font-semibold text-foreground">Pearl Marine Ltd</div>
            <div className="text-[10px] text-muted-foreground">Singapore</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CopilotCommandsPanel({
  onRun,
  vessel,
  investigation,
  hasIntelligencePackage,
  role,
  disabled,
}: {
  onRun: (prompt: string) => void;
  vessel?: string;
  investigation?: string;
  hasIntelligencePackage?: boolean;
  role?: CommandPermission;
  disabled?: boolean;
}) {
  const ctx = useMemo<CommandExecutionContext>(
    () => ({ vessel, investigation, hasIntelligencePackage, role }),
    [vessel, investigation, hasIntelligencePackage, role],
  );
  return (
    <section>
      <SectionLabel>Copilot Commands</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {COPILOT_COMMANDS.map((cmd) => {
          const availability = evaluateAvailability(cmd, ctx);
          const isAvailable = availability.available;
          const title = isAvailable ? cmd.description : availability.reason;
          return (
            <button
              key={cmd.commandId}
              type="button"
              disabled={disabled || !isAvailable}
              onClick={() => {
                const res = routeCommand(cmd, ctx, onRun);
                if (!res.ok) {
                  // eslint-disable-next-line no-console
                  console.info("[CopilotCommand] blocked:", res.message);
                }
              }}
              title={title}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition",
                isAvailable
                  ? "border-border/60 bg-background/60 text-foreground/85 hover:border-primary/40 hover:bg-primary/5"
                  : "cursor-not-allowed border-border/40 bg-background/30 text-muted-foreground/60",
              )}
            >
              <cmd.icon className="h-3.5 w-3.5 text-[color:var(--color-teal)]" />
              <span className="truncate">{cmd.displayName}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

