/**
 * Shared helpers used by playbook rule bodies. Keeps individual
 * playbooks concise and consistent.
 */
import type { PlaybookContext, PlaybookFinding } from "./types";

export function findingsMatch(ctx: PlaybookContext, needles: string[]): PlaybookFinding[] {
  const lowered = needles.map((n) => n.toLowerCase());
  return ctx.criticalFindings.filter((f) => {
    const hay = `${f?.title ?? ""} ${f?.source ?? ""}`.toLowerCase();
    return lowered.some((n) => hay.includes(n));
  });
}

export function hasFinding(ctx: PlaybookContext, needles: string[]): boolean {
  return findingsMatch(ctx, needles).length > 0;
}

export function hasCriticalFinding(ctx: PlaybookContext): boolean {
  return ctx.criticalFindings.some((f) => f?.priority === "critical" || f?.priority === "high");
}

export function corroborationCount(ctx: PlaybookContext): number {
  return ctx.sources?.corroborated ?? 0;
}

export function tier(ctx: PlaybookContext): "low" | "medium" | "high" {
  return ctx.matrix?.tier ?? "low";
}

export function revenueExposure(ctx: PlaybookContext): number {
  return ctx.decisionImpact?.revenue ?? 0;
}

export function formatNaira(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "₦0";
  return `₦${Math.round(n).toLocaleString()}`;
}
