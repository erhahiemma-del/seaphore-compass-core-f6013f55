/**
 * SEAPHORE — Honesty & Compliance Rules
 *
 * These twelve rules override every other specification. If a spec conflicts
 * with a rule below, the rule wins. Enforcement is architectural — the
 * primitives in `src/components/compliance/*` and `src/lib/compliance/*`
 * exist so no module can ship a screen that bypasses them.
 *
 * Governing sentence (immutable):
 *   "Evidence first. Explainable always. Officer decides."
 * If a feature cannot satisfy all three clauses, it does not ship.
 */

export const SEAPHORE_OATH =
  "Evidence first. Explainable always. Officer decides." as const;

export const OFFICER_ACCOUNTABILITY_NOTICE =
  "You are responsible for this decision. Seaphore provides recommendations and evidence, but you are accountable." as const;

export type HonestyRuleId =
  | "HR-1" | "HR-2" | "HR-3" | "HR-4" | "HR-5" | "HR-6"
  | "HR-7" | "HR-8" | "HR-9" | "HR-10" | "HR-11" | "HR-12";

export interface HonestyRule {
  id: HonestyRuleId;
  level: "MUST";
  title: string;
  statement: string;
  enforcedBy: string[];
}

export const HONESTY_RULES: readonly HonestyRule[] = [
  {
    id: "HR-1",
    level: "MUST",
    title: "Every figure carries a confidence chip",
    statement:
      "Every figure, count, aggregate, status, and claim displays a Confidence chip. A figure without a chip is a build defect.",
    enforcedBy: ["<Metric>", "<ConfidenceChip>"],
  },
  {
    id: "HR-2",
    level: "MUST",
    title: "VERIFIED requires an authoritative source",
    statement:
      "VERIFIED is used only when the data comes from an authoritative, named source. Never VERIFIED for computed or inferred data.",
    enforcedBy: ["<Metric tier=\"verified\" source=…>", "assertVerifiedSource()"],
  },
  {
    id: "HR-3",
    level: "MUST",
    title: "Observed language, never conclusive language",
    statement:
      "System-generated signals use observed language. The system observes; the officer concludes.",
    enforcedBy: ["<SignalStatement>", "assertObservedLanguage()"],
  },
  {
    id: "HR-4",
    level: "MUST",
    title: "Officer accountability is hard-coded on every decision form",
    statement:
      "The Officer Decision form always states officer accountability. This text is hard-coded and never removed.",
    enforcedBy: ["<OfficerAccountabilityNotice>"],
  },
  {
    id: "HR-5",
    level: "MUST",
    title: "Sanctions matches require authoritative confirmation",
    statement:
      "Compliance/sanctions matches display as VERIFIED only when matched against an authoritative, current list. INFERRED is not permitted for hard sanctions.",
    enforcedBy: ["<SanctionsMatch>", "assertSanctionsTier()"],
  },
  {
    id: "HR-6",
    level: "MUST",
    title: "Neutral vessel names only",
    statement:
      "Vessel names in mock and real data are neutral. No vessel name may imply guilt.",
    enforcedBy: ["assertNeutralVesselName()"],
  },
  {
    id: "HR-7",
    level: "MUST",
    title: "Exports carry an irremovable evidence envelope",
    statement:
      "Every export automatically and irremovably includes: evidence list with sources, confidence levels, complete audit trail, officer name and role, and WAT timestamp.",
    enforcedBy: ["buildExportEnvelope()"],
  },
  {
    id: "HR-8",
    level: "MUST",
    title: "Share/Send requires an explicit officer action",
    statement:
      "Share/Send operations require officer authorisation. The system never sends a brief automatically.",
    enforcedBy: ["<SendShareGate>", "requireOfficerAuthorization()"],
  },
  {
    id: "HR-9",
    level: "MUST",
    title: "Immutable audit log on every data-changing action",
    statement:
      "Every data-changing action writes an immutable audit log entry: time, officer, action, entity, IP. Audit logs cannot be deleted by any user role.",
    enforcedBy: ["writeAuditLog()", "public.audit_log (append-only)"],
  },
  {
    id: "HR-10",
    level: "MUST",
    title: "Governing footer on every screen",
    statement: `The footer "${SEAPHORE_OATH}" appears on every screen.`,
    enforcedBy: ["<AppShell> footer", "assertSeaphoreOath()"],
  },
  {
    id: "HR-11",
    level: "MUST",
    title: "Copilot outputs are labelled and sourced",
    statement:
      "Every Copilot output labels its confidence level and shows sources. It never presents an inference as a fact.",
    enforcedBy: ["<CopilotOutput>"],
  },
  {
    id: "HR-12",
    level: "MUST",
    title: "AI confidence percentages disclose their basis",
    statement:
      "AI confidence percentages are shown with their basis visible one click away. A bare percentage with no decomposition is not permitted.",
    enforcedBy: ["<AiConfidence basis=…>"],
  },
] as const;

export function getRule(id: HonestyRuleId): HonestyRule {
  const r = HONESTY_RULES.find((r) => r.id === id);
  if (!r) throw new Error(`Unknown honesty rule: ${id}`);
  return r;
}
