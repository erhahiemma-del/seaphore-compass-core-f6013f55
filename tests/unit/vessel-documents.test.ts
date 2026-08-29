/**
 * What documentary record Seaphore can reach for a vessel.
 *
 * Almost every answer here is an absence, and the whole point is that the
 * absences are not interchangeable. "No manifest" reads as a fact about the
 * ship — that nothing was filed, which for a cargo vessel arriving at Apapa
 * would be a serious finding. What is actually true is narrower and duller:
 * a manifest hangs off a voyage record, and Seaphore cannot read the voyage
 * register here, so it cannot attribute filings to this vessel either way.
 *
 * Collapsing those two into one empty section would invent an accusation.
 */
import { describe, expect, it } from "vitest";

import { vesselDocuments } from "@/services/geospatial/vessel-documents";
import type { Voyage } from "@/services/geospatial/voyage";

const voyage = { id: "voyage-1" } as Voyage;

describe("the manifest link", () => {
  /*
   * The default case for every live map vessel: Datalastic reports where a
   * ship is, not what was filed about it, and the register that would
   * connect the two is unreadable.
   */
  it("blames the unreadable register, not the vessel", () => {
    const manifest = vesselDocuments().entries.find((e) => e.kind === "Manifest")!;

    expect(manifest.availability).toBe("NOT_CONNECTED");
    expect(manifest.note).toMatch(/voyage register/i);
    // The sentence must explicitly refuse the inference.
    expect(manifest.note).toMatch(/says nothing about whether a manifest was filed/i);
  });

  /*
   * A readable register with no entry for this vessel is a different
   * statement again: filings may exist and Seaphore cannot attribute them.
   * That is NO_LINK, not NO_RECORD, because nobody has looked at filings.
   */
  it("separates a readable register with no voyage from an unreadable one", () => {
    const manifest = vesselDocuments({ registerReadable: true }).entries.find(
      (e) => e.kind === "Manifest",
    )!;

    expect(manifest.availability).toBe("NO_LINK");
    expect(manifest.note).toMatch(/without Seaphore being able to attribute/i);
  });

  it("reports an unverified manifest when a voyage record resolves", () => {
    const manifest = vesselDocuments({ registerReadable: true, voyage }).entries.find(
      (e) => e.kind === "Manifest",
    )!;

    expect(manifest.availability).toBe("NOT_VERIFIED");
    expect(manifest.recordId).toBe("voyage-1");
  });
});

describe("sources that are simply not connected", () => {
  it("says no bill-of-lading source exists, not that the vessel has none", () => {
    const bol = vesselDocuments().entries.find((e) => e.kind === "Bill of lading")!;

    expect(bol.availability).toBe("NOT_CONNECTED");
    expect(bol.note).toMatch(/no bill-of-lading source is connected/i);
  });

  /*
   * TradeAtlas and Volza are registered adapters that return empty
   * envelopes. Reporting that as "no trade records for this vessel" would
   * present unbuilt scaffolding as a finding.
   */
  it("names the trade providers as returning nothing rather than the vessel having nothing", () => {
    const trade = vesselDocuments().entries.find((e) => e.kind === "Trade record")!;

    expect(trade.availability).toBe("NOT_CONNECTED");
    expect(trade.note).toMatch(/return no data/i);
  });
});

describe("the shape of the answer", () => {
  it("never claims a document is available without a record", () => {
    for (const input of [{}, { registerReadable: true }, { registerReadable: true, voyage }]) {
      for (const entry of vesselDocuments(input).entries) {
        if (entry.availability === "AVAILABLE") {
          expect(entry.recordId, `${entry.kind} claimed available with no record`).toBeTruthy();
        }
      }
    }
  });

  it("reports nothing as available in this deployment", () => {
    // Honest today. If this ever flips, it must be because a source was
    // connected — not because a state was relabelled.
    expect(vesselDocuments().anyAvailable).toBe(false);
    expect(vesselDocuments({ registerReadable: true, voyage }).anyAvailable).toBe(false);
  });

  it("explains every entry", () => {
    for (const entry of vesselDocuments().entries) {
      expect(entry.note.length, `${entry.kind} must explain itself`).toBeGreaterThan(0);
    }
  });

  it("lists all three record kinds regardless of state", () => {
    const kinds = vesselDocuments().entries.map((e) => e.kind);

    // Omitting an unavailable kind would narrow what an officer believes
    // was looked for.
    expect(kinds).toEqual(["Manifest", "Bill of lading", "Trade record"]);
  });
});
