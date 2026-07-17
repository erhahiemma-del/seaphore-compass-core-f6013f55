/**
 * SEAPHORE compliance primitives.
 *
 * Every module — Mission Control, Detect, Investigate, Decision Support,
 * Share, Institutional Memory, and every Intelligence Centre — MUST render
 * figures, signals, decisions, copilot outputs, AI confidences, and share
 * actions through these primitives. Bypassing them is a build defect.
 *
 * See src/lib/compliance/rules.ts and src/lib/compliance/README.md.
 */

export { Metric } from "./metric";
export { SignalStatement } from "./signal-statement";
export { OfficerAccountabilityNotice } from "./officer-accountability-notice";
export { CopilotOutput } from "./copilot-output";
export { AiConfidence } from "./ai-confidence";
export { SendShareGate } from "./send-share-gate";
