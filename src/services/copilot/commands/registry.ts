/**
 * CopilotCommandRegistry — Sprint UX-002.
 *
 * Single source of truth for every Copilot Command. The UI renders
 * buttons dynamically from this registry; each button, when clicked,
 * dispatches through {@link CopilotCommandRouter} which builds a
 * canonical prompt from `promptTemplate` and hands it to the exact
 * same execution path as a typed message — the existing OIE pipeline
 * (Mission Builder → OIE → ICE → IAL → Adaptive Briefing). There is no
 * duplicate orchestration, AI logic, or connector code here: this file
 * is interaction metadata only.
 *
 * Typing "Generate briefing" or clicking `Generate Briefing` therefore
 * yield the same executed prompt and the same intelligence result.
 */
import type { LucideIcon } from "lucide-react";
import {
  Anchor,
  Ban,
  Building2,
  DollarSign,
  FileSearch,
  FileText,
  MapPin,
  Package,
  ShieldCheck,
  Ship,
  Sparkles,
} from "lucide-react";

/** Kinds of ambient state a command can require before it runs. */
export type CommandContextRequirement =
  | "vessel"
  | "investigation"
  | "intelligence_package"
  | "ais_context";

export type CommandCategory =
  | "briefing"
  | "intelligence"
  | "operations"
  | "compliance"
  | "reporting";

export type CommandPermission = "officer" | "analyst" | "director" | "administrator";

/** Officer-visible context passed into template resolution + follow-ups. */
export interface CommandExecutionContext {
  /** Resolved vessel display name, when one is currently selected. */
  vessel?: string;
  /** Selected investigation ID/label. */
  investigation?: string;
  /** Selected port label. */
  port?: string;
  /** True if a prior briefing/intelligence package is available for reuse. */
  hasIntelligencePackage?: boolean;
  /** True if an AIS timeline is currently loaded for the selected vessel. */
  hasAisContext?: boolean;
  /** Officer role — drives permission gating. */
  role?: CommandPermission;
}

export interface CopilotCommand {
  commandId: string;
  displayName: string;
  description: string;
  icon: LucideIcon;
  category: CommandCategory;
  /**
   * Handlebars-ish template resolved against
   * {@link CommandExecutionContext}. Placeholders like `{{vessel}}`
   * expand from context; missing values fall back to
   * `the selected vessel` etc. so the OIE conversational resolver can
   * apply the sticky anchor.
   */
  promptTemplate: string;
  requiredContext: CommandContextRequirement[];
  missionType: string;
  permissions: CommandPermission[];
  /** Dynamic follow-ups suggested when planner returns none. */
  followUpGenerator: (ctx: CommandExecutionContext) => string[];
  confirmationRequired?: boolean;
}

/** Resolve `{{placeholder}}` tokens against context. */
export function resolvePromptTemplate(
  template: string,
  ctx: CommandExecutionContext,
): string {
  const fallback = ctx.vessel ?? "the selected vessel";
  return template
    .replaceAll("{{vessel}}", ctx.vessel ?? fallback)
    .replaceAll("{{investigation}}", ctx.investigation ?? "the current investigation")
    .replaceAll("{{port}}", ctx.port ?? "the current port");
}

/**
 * Returns the availability of a command against the current context.
 * Unavailable commands render disabled with `reason` as a tooltip;
 * they do NOT disappear — the officer should see the whole capability
 * surface and understand why one is gated.
 */
export function evaluateAvailability(
  cmd: CopilotCommand,
  ctx: CommandExecutionContext,
): { available: true } | { available: false; reason: string } {
  if (cmd.permissions.length > 0 && ctx.role && !cmd.permissions.includes(ctx.role)) {
    return { available: false, reason: `Requires role: ${cmd.permissions.join(" / ")}.` };
  }
  for (const req of cmd.requiredContext) {
    if (req === "vessel" && !ctx.vessel) {
      return { available: false, reason: "Select a vessel to enable this command." };
    }
    if (req === "investigation" && !ctx.investigation) {
      return {
        available: false,
        reason: "Open an investigation to enable this command.",
      };
    }
    if (req === "intelligence_package" && !ctx.hasIntelligencePackage) {
      return {
        available: false,
        reason: "Generate a briefing first — this command reuses the existing intelligence package.",
      };
    }
    if (req === "ais_context" && !ctx.hasAisContext) {
      return {
        available: false,
        reason: "No AIS timeline is currently loaded for this vessel.",
      };
    }
  }
  return { available: true };
}

const DEFAULT_FOLLOWUPS = (ctx: CommandExecutionContext): string[] => {
  const subject = ctx.vessel ?? "this vessel";
  return [
    `Explain ownership of ${subject}`,
    `Replay AIS timeline for ${subject}`,
    "Show manifest",
    "Compare previous voyage",
    "Generate executive report",
  ];
};

export const COPILOT_COMMANDS: CopilotCommand[] = [
  {
    commandId: "generate_briefing",
    displayName: "Generate Briefing",
    description:
      "Executive Operational Briefing covering position, cargo, ownership, revenue, compliance and risk.",
    icon: FileText,
    category: "briefing",
    promptTemplate: "Generate an Executive Operational Briefing for {{vessel}}.",
    requiredContext: ["vessel"],
    missionType: "executive_briefing",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: DEFAULT_FOLLOWUPS,
  },
  {
    commandId: "ownership_intelligence",
    displayName: "Ownership Intelligence",
    description:
      "Ultimate beneficial owner, corporate structure, holding companies, jurisdictions, sanctions exposure and ownership risk.",
    icon: Building2,
    category: "intelligence",
    promptTemplate:
      "Explain the ownership of {{vessel}}: ultimate beneficial owner, corporate structure, holding companies, jurisdictions, sanctions exposure and ownership risk.",
    requiredContext: ["vessel"],
    missionType: "ownership_dossier",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: (ctx) => [
      `Show sanctions exposure for ${ctx.vessel ?? "this owner"}`,
      "Compare against previous operator",
      "Explain jurisdictional risk",
    ],
  },
  {
    commandId: "manifest_intelligence",
    displayName: "Manifest Intelligence",
    description:
      "Manifest summary, container breakdown, declared goods, missing fields, discrepancies, revenue exposure and inspection recommendations.",
    icon: FileSearch,
    category: "intelligence",
    promptTemplate:
      "Show the manifest for {{vessel}}: manifest summary, container breakdown, declared goods, missing fields, discrepancies, revenue exposure and inspection recommendations.",
    requiredContext: ["vessel"],
    missionType: "manifest_dossier",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: (ctx) => [
      "Flag discrepancies for inspection",
      `Compare to previous voyage of ${ctx.vessel ?? "this vessel"}`,
      "Explain revenue exposure",
    ],
  },
  {
    commandId: "cargo_intelligence",
    displayName: "Cargo Intelligence",
    description:
      "Cargo summary, container summary, dangerous goods, revenue impact, compliance findings and risk.",
    icon: Package,
    category: "intelligence",
    promptTemplate:
      "Analyse cargo for {{vessel}}: cargo summary, container summary, dangerous goods, revenue impact, compliance findings and risk.",
    requiredContext: ["vessel"],
    missionType: "cargo_dossier",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: () => [
      "List dangerous goods",
      "Show declared vs assessed value",
      "Recommend inspection profile",
    ],
  },
  {
    commandId: "compliance_intelligence",
    displayName: "Compliance Intelligence",
    description:
      "Sanctions, regulatory findings, port-state control history, previous violations and recommendations.",
    icon: ShieldCheck,
    category: "compliance",
    promptTemplate:
      "Provide a compliance dossier for {{vessel}}: sanctions, regulatory findings, port-state control history, previous violations and recommendations.",
    requiredContext: ["vessel"],
    missionType: "compliance_dossier",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: () => [
      "Show sanctions matches with evidence",
      "List open regulatory findings",
      "Explain enforcement history",
    ],
  },
  {
    commandId: "explain_risk",
    displayName: "Explain Risk",
    description:
      "Risk contributors, supporting evidence, confidence, reasoning and recommended mitigations.",
    icon: Sparkles,
    category: "intelligence",
    promptTemplate:
      "Explain why {{vessel}} is high risk: contributors, supporting evidence, confidence, reasoning and recommended mitigations.",
    requiredContext: ["vessel"],
    missionType: "risk_explanation",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: () => [
      "Show top risk contributors with evidence",
      "Suggest mitigations",
      "Compare risk to fleet baseline",
    ],
  },
  {
    commandId: "ais_replay",
    displayName: "AIS Replay",
    description:
      "Movement summary, port calls, anchorage, dark periods, AIS gaps, speed changes and risk events.",
    icon: MapPin,
    category: "operations",
    promptTemplate:
      "Replay AIS timeline for {{vessel}} over the last voyage: movement summary, port calls, anchorage, dark periods, AIS gaps, speed changes and risk events.",
    requiredContext: ["vessel"],
    missionType: "ais_replay",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: (ctx) => [
      "Show dark periods only",
      "Compare to previous voyage",
      `Replay last 7 days for ${ctx.vessel ?? "this vessel"}`,
    ],
  },
  {
    commandId: "revenue_impact",
    displayName: "Revenue Impact",
    description:
      "Expected revenue, estimated revenue, potential leakage, historical revenue, collection status and recommendations.",
    icon: DollarSign,
    category: "operations",
    promptTemplate:
      "Assess revenue impact for {{vessel}}: expected revenue, estimated revenue, potential leakage, historical revenue, collection status, revenue risk and recommendations.",
    requiredContext: ["vessel"],
    missionType: "revenue_impact",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: () => [
      "Show leakage breakdown by fee type",
      "Compare declared vs assessed value",
      "Recommend collection actions",
    ],
  },
  {
    commandId: "compare_vessel",
    displayName: "Compare Vessel",
    description:
      "Ownership, manifest, cargo, revenue, voyage and risk comparison against another vessel.",
    icon: Ship,
    category: "intelligence",
    promptTemplate:
      "Compare {{vessel}} against another vessel — ownership, manifest, cargo, revenue, voyage and risk — and provide an operational recommendation.",
    requiredContext: ["vessel"],
    missionType: "vessel_comparison",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: (ctx) => [
      `Compare ${ctx.vessel ?? "this vessel"} to its previous voyage`,
      "Compare against fleet baseline",
      "Suggest a comparison target",
    ],
  },
  {
    commandId: "create_investigation",
    displayName: "Create Investigation",
    description:
      "Create investigation, mission, evidence collection, workspace and conversation. Returns investigation number, priority and suggested tasks.",
    icon: Anchor,
    category: "operations",
    promptTemplate:
      "Create a new investigation for {{vessel}}. Open a mission, seed evidence collection, provision a workspace and return investigation number, priority, suggested tasks and next recommended actions.",
    requiredContext: ["vessel"],
    missionType: "create_investigation",
    permissions: ["officer", "director", "administrator"],
    followUpGenerator: () => [
      "Assign investigation to me",
      "List suggested tasks",
      "Show recommended evidence",
    ],
    confirmationRequired: true,
  },
  {
    commandId: "export_report",
    displayName: "Export Report",
    description:
      "Export the existing intelligence package as PDF or DOCX. Reuses cached intelligence — never regenerates evidence.",
    icon: FileText,
    category: "reporting",
    promptTemplate:
      "Export the current intelligence package for {{vessel}} as an executive report. Reuse existing intelligence — do not regenerate evidence — and confirm the export format (PDF or DOCX).",
    requiredContext: ["vessel", "intelligence_package"],
    missionType: "export_report",
    permissions: ["officer", "analyst", "director", "administrator"],
    followUpGenerator: () => [
      "Export as PDF",
      "Export as DOCX",
      "Include full intelligence report",
    ],
  },
];

/** Blocked command — never registered. Kept to keep bundle explicit. */
export const _NEVER_REGISTERED_SENTINEL: LucideIcon = Ban;

export function getCommandById(id: string): CopilotCommand | undefined {
  return COPILOT_COMMANDS.find((c) => c.commandId === id);
}
