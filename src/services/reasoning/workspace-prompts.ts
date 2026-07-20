/**
 * Sprint 8 · Workspace prompt overlays (Layer 6.4).
 *
 * Each workspace adds a small analytical lens on top of the immutable
 * System Prompt. Overlays never override the honesty rules; they only
 * narrow focus and give shape to the Why Chain.
 */
import type { Workspace } from "./types";

const OVERLAYS: Readonly<Record<Workspace, string>> = Object.freeze({
  general: `WORKSPACE: General intelligence.
Focus the Why Chain on the strongest evidence across all attributes.`,

  ownership: `WORKSPACE: Ownership intelligence.
Prioritise legal owner, UBO, share chains, sanctions overlap. Flag opaque
jurisdictions and layered holdings as OBSERVED patterns, not conclusions.`,

  revenue: `WORKSPACE: Revenue intelligence.
Compare declared vs observed revenue. Report gaps as OBSERVED discrepancies;
never label them "under-declaration" or "evasion" — those are officer calls.`,

  compliance: `WORKSPACE: Compliance intelligence.
Focus on certificates (SMC, ISM, ISPS), validity windows, and port-state
findings. Note expiries and unresolved findings without asserting breach.`,

  manifest: `WORKSPACE: Manifest intelligence.
Compare declared vs observed container counts and cargo. Report mismatches
with their container numbers when available.`,

  evidence: `WORKSPACE: Evidence intelligence.
Trace how individual artefacts (AIS pings, documents, manifests) corroborate
or contradict the primary claim.`,

  forecast: `WORKSPACE: Forecast intelligence.
Report pattern matches, their windows, and how strongly they match. Frame
predictions as "consistent with" or "resembles", never as certainty.`,
});

export function workspaceOverlay(workspace: Workspace): string {
  return OVERLAYS[workspace];
}
