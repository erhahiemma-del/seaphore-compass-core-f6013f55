/**
 * Sprint 10 · Policy Engine — permission catalogue (Layer 2.14).
 *
 * The five capabilities enumerated in the sprint spec. Kept as a const
 * union so the type system rejects typos at every call site.
 */
export const PERMISSIONS = [
  "CAN_CREATE_CASE",
  "CAN_NOTIFY_CUSTOMS",
  "CAN_REQUEST_DOCUMENTS",
  "CAN_ASSIGN_OFFICERS",
  "CAN_FREEZE_CLEARANCE",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

import type { WorkflowId } from "@/services/workflows";

/** Workflow → capability required to execute it (Layer 5.3). */
export const WORKFLOW_PERMISSION: Readonly<Record<WorkflowId, Permission>> = Object.freeze({
  open_investigation: "CAN_CREATE_CASE",
  notify_customs: "CAN_NOTIFY_CUSTOMS",
  request_manifest: "CAN_REQUEST_DOCUMENTS",
  assign_officer: "CAN_ASSIGN_OFFICERS",
  freeze_clearance: "CAN_FREEZE_CLEARANCE",
});
