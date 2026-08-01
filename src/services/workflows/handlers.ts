/**
 * Sprint 9 · Workflow handlers — one per WorkflowId.
 *
 * Handlers receive validated input and the adapter surface. They return a
 * plain, JSON-serialisable result on success and throw on failure so the
 * engine can decide whether to retry.
 */
import { z } from "zod";
import type { MockAdapters } from "./adapters";
import type { WorkflowId } from "./types";

const OpenInvestigationInput = z.object({
  title: z.string().min(3),
  vesselId: z.string().optional(),
  briefingId: z.string().optional(),
});

const NotifyCustomsInput = z.object({
  subject: z.string().min(3),
  body: z.string().min(3),
});

const RequestManifestInput = z.object({
  vesselId: z.string(),
  ref: z.string(),
});

const AssignOfficerInput = z.object({
  caseId: z.string(),
  officerId: z.string(),
});

const FreezeClearanceInput = z.object({
  vesselId: z.string(),
  reason: z.string().min(3),
});

export interface Handler<T extends z.ZodTypeAny> {
  readonly schema: T;
  readonly maxAttempts: number;
  execute(input: z.infer<T>, adapters: MockAdapters): Promise<Record<string, unknown>>;
}

export const HANDLERS: Readonly<Record<WorkflowId, Handler<z.ZodTypeAny>>> = Object.freeze({
  open_investigation: {
    schema: OpenInvestigationInput,
    maxAttempts: 2,
    async execute(input, adapters) {
      const c = await adapters.openCase({
        title: input.title,
        vesselId: input.vesselId,
      });
      return { caseId: c.caseId, title: c.title, vesselId: c.vesselId };
    },
  },

  notify_customs: {
    schema: NotifyCustomsInput,
    maxAttempts: 3,
    async execute(input, adapters) {
      const r = await adapters.notify({
        channel: "customs",
        subject: input.subject,
        body: input.body,
      });
      return { messageId: r.messageId };
    },
  },

  request_manifest: {
    schema: RequestManifestInput,
    maxAttempts: 3,
    async execute(input, adapters) {
      const r = await adapters.requestDocument({ docType: "manifest", ref: input.ref });
      return { requestId: r.requestId, vesselId: input.vesselId };
    },
  },

  assign_officer: {
    schema: AssignOfficerInput,
    maxAttempts: 2,
    async execute(input, adapters) {
      const r = await adapters.assign({ caseId: input.caseId, officerId: input.officerId });
      return { caseId: r.caseId, assigneeId: r.assigneeId, assignedAt: r.assignedAt };
    },
  },

  freeze_clearance: {
    schema: FreezeClearanceInput,
    maxAttempts: 2,
    async execute(input, adapters) {
      const r = await adapters.freezeClearance({ vesselId: input.vesselId, reason: input.reason });
      return { holdId: r.holdId, vesselId: r.vesselId };
    },
  },
});
