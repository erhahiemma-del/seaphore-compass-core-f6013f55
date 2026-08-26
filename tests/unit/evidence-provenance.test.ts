/**
 * The Evidence Library says where its rows came from.
 *
 * `listEvidence()` fell back to `EVIDENCE_LIBRARY` whenever the query
 * failed or the table was empty, and returned it in the same shape as
 * real rows. The Library therefore could not tell them apart, and
 * presented demonstration fixtures as authoritative evidence — in an
 * application whose first principle is "evidence first". Nothing was
 * lying on purpose; there was simply no fact available to be honest
 * with.
 *
 * Two failures are possible here and only one of them is loud. Labelling
 * real evidence "simulated" would make officers distrust genuine
 * records; showing the seed unmarked would have them act on records that
 * do not exist. These pin both directions.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(backend.result),
  };
  return { supabase: { from: () => chain } };
});

const { EVIDENCE_LIBRARY } = await import("@/features/evidence/data");
const { listEvidence } = await import("@/services/evidence.service");

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LIBRARY = read("src/features/evidence/EvidenceLibrary.tsx");

const ROW = {
  id: "EV-REAL-1",
  investigation_id: null,
  kind: "document",
  title: "Bill of lading — MV Real",
  collected_at: "2026-08-01T00:00:00.000Z",
};

describe("listEvidence reports its source", () => {
  beforeEach(() => {
    backend.result = { data: null, error: null };
  });

  it("reports backend rows as backend", () => {
    backend.result = { data: [ROW], error: null };
    return listEvidence().then((listing) => {
      expect(listing.source).toBe("backend");
      expect(listing.reason).toBeUndefined();
      expect(listing.items).toHaveLength(1);
      // Real evidence must never be handed back as the seed.
      expect(listing.items).not.toBe(EVIDENCE_LIBRARY);
    });
  });

  it("reports a failed query as an unavailable backend", async () => {
    backend.result = { data: null, error: { message: "connection refused" } };
    const listing = await listEvidence();
    expect(listing.source).toBe("fixture");
    expect(listing.reason).toBe("unavailable");
    expect(listing.items).toBe(EVIDENCE_LIBRARY);
  });

  it("distinguishes an empty backend from an unreachable one", async () => {
    // A backend holding no evidence and a backend that failed are
    // different situations. Collapsing them would hide an outage behind
    // "no records yet".
    backend.result = { data: [], error: null };
    const listing = await listEvidence();
    expect(listing.source).toBe("fixture");
    expect(listing.reason).toBe("empty");
  });
});

describe("the Library labels fixtures and only fixtures", () => {
  it("shows the notice when, and only when, the rows are the seed", () => {
    expect(LIBRARY).toContain('const showingFixtures = listing.source === "fixture"');
    expect(LIBRARY).toContain("{showingFixtures && <DemoDataNotice");
    // Never unconditional: that would label real evidence as demo data.
    expect(LIBRARY).not.toMatch(/^\s*<DemoDataNotice/m);
  });

  it("asks the backend immediately rather than resting on the seed", () => {
    /*
     * `initialData` is treated as fresh, so with `staleTime` the backend
     * was not asked at all for the first 30 seconds — the Library simply
     * showed fixtures and called them evidence.
     */
    expect(LIBRARY).toContain("initialDataUpdatedAt: 0");
    expect(LIBRARY).toContain("initialData: FIXTURE_EVIDENCE_LISTING");
  });

  it("keeps the fixture, and keeps it labelled", () => {
    // Deleting the seed was never the fix — an empty workspace is not
    // more honest than a labelled one.
    expect(() => read("src/features/evidence/data.ts")).not.toThrow();
    expect(LIBRARY).toContain('surface="Evidence Library"');
  });
});
