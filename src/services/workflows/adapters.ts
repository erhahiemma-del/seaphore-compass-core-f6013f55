/**
 * Sprint 9 · Mock external-service adapters.
 *
 * These stand in for the real Sprint 12 integrations. Each adapter is a
 * plain async function returning a serialisable payload. Failure modes are
 * injectable so the test suite can exercise retry paths.
 */

export interface AdapterFailurePlan {
  /** Fail the next N calls with this error message. Defaults to zero. */
  failNext?: number;
  failMessage?: string;
}

export function createMockAdapters(failure: Partial<Record<string, AdapterFailurePlan>> = {}) {
  const remaining = new Map<string, number>();
  for (const [k, v] of Object.entries(failure)) {
    if (v?.failNext) remaining.set(k, v.failNext);
  }

  function maybeFail(name: string): void {
    const left = remaining.get(name) ?? 0;
    if (left > 0) {
      remaining.set(name, left - 1);
      throw new Error(failure[name]?.failMessage ?? `Mock ${name} failure`);
    }
  }

  return {
    /** Case management: create investigation record. */
    async openCase(input: { title: string; vesselId?: string }) {
      maybeFail("openCase");
      return {
        caseId: `CASE-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
        title: input.title,
        vesselId: input.vesselId ?? null,
      };
    },
    /** Notification bus: notify a partner agency. */
    async notify(input: { channel: string; subject: string; body: string }) {
      maybeFail("notify");
      return { messageId: `MSG-${Date.now().toString(36)}`, channel: input.channel };
    },
    /** Document requester: request a manifest from customs. */
    async requestDocument(input: { docType: string; ref: string }) {
      maybeFail("requestDocument");
      return {
        requestId: `DOC-${Date.now().toString(36)}`,
        docType: input.docType,
        ref: input.ref,
      };
    },
    /** Assignment service: assign an officer to a case. */
    async assign(input: { caseId: string; officerId: string }) {
      maybeFail("assign");
      return {
        caseId: input.caseId,
        assigneeId: input.officerId,
        assignedAt: new Date().toISOString(),
      };
    },
    /** Port control: place a hold on a vessel's clearance. */
    async freezeClearance(input: { vesselId: string; reason: string }) {
      maybeFail("freezeClearance");
      return { holdId: `HOLD-${Date.now().toString(36)}`, vesselId: input.vesselId };
    },
  };
}

export type MockAdapters = ReturnType<typeof createMockAdapters>;
