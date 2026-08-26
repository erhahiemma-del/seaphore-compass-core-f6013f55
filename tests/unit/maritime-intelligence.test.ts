/**
 * M2.8 — Maritime intelligence broker, identity and authority.
 *
 * Three properties carry this phase, and each fails silently rather than
 * loudly if it regresses:
 *
 *   Absence is four different facts. "No provider supports this",
 *   "providers exist but none is connected", "we asked and nothing came
 *   back" and "here is the evidence" must never collapse. Collapsing
 *   them is how an unconnected AIS feed renders as an empty ocean.
 *
 *   Authority is property-specific. A sanctions provider out-ranking an
 *   AIS feed on a vessel position produces a confident, wrong answer —
 *   no error, no warning.
 *
 *   Identity is anchored on IMO and never guessed. Accepting an MMSI as
 *   an IMO, or promoting a provider's record id to an identity, attaches
 *   records to the wrong hull later and is unrecoverable once written.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  fromAisProviderStatus,
  fromFeedHealth,
  fromSourceStatus,
  isQueryable,
} from "@/adapters/availability";
import { DATA_SOURCE_MATRIX } from "@/adapters/matrix";
import { authorityScore } from "@/services/fusion/confidence";
import type { NormalizedEvidence } from "@/services/fusion/types";
import {
  VesselIdentityIndex,
  normalizeImo,
  vesselIdentityIndex,
} from "@/intelligence/matching/vessel-identity";
import {
  canQuery,
  getProviderAvailability,
  getVesselIntelligence,
  getVesselPosition,
  queryableProviders,
} from "@/services/maritime-intelligence";

const IMO = "9111111";

function evidence(over: Partial<NormalizedEvidence>): NormalizedEvidence {
  return {
    id: over.id ?? "e1",
    agent: "test",
    sourceSystem: over.sourceSystem ?? "Datalastic",
    entityIds: [IMO],
    attribute: over.attribute ?? "vessel.position",
    value: over.value ?? "4.5321,3.3820",
    unit: null,
    grade: over.grade ?? "observed",
    collectedAt: over.collectedAt ?? new Date().toISOString(),
    contentHash: over.contentHash ?? `h-${over.id ?? "e1"}`,
    raw: null,
    ...over,
  } as NormalizedEvidence;
}

/* ═══════ 1. Availability translation ═══════ */

describe("availability translates without hiding the reason", () => {
  it("maps matrix statuses onto queryability", () => {
    expect(fromSourceStatus("ACTIVE").availability).toBe("available");
    expect(fromSourceStatus("PARTIAL").availability).toBe("available");
    expect(fromSourceStatus("PLANNED").availability).toBe("planned");
    expect(fromSourceStatus("NOT_IN_SCOPE").availability).toBe("unsupported");
  });

  it("treats PENDING_CREDENTIALS as configuration, not failure", () => {
    // The AIS registry documents this as "not an error". Mapping it to
    // temporarily-unavailable would suggest it might recover on its own.
    const reading = fromAisProviderStatus("PENDING_CREDENTIALS");
    expect(reading.availability).toBe("credentials-required");
    expect(fromAisProviderStatus("FAILED").availability).toBe("temporarily-unavailable");
    expect(fromAisProviderStatus("RATE_LIMITED").availability).toBe("temporarily-unavailable");
  });

  it("always preserves the original status for diagnostics", () => {
    for (const status of ["PENDING_CREDENTIALS", "FAILED", "STALE", "CONNECTED"]) {
      const reading = fromAisProviderStatus(status);
      expect(reading.providerStatus).toBe(status);
      expect(reading.reason).toBe(status);
      expect(reading.vocabulary).toBe("ais-registry");
    }
    expect(fromSourceStatus("PLANNED").vocabulary).toBe("source-matrix");
  });

  it("reports a connected but old feed as stale, and still queryable", () => {
    const stale = fromFeedHealth({ connected: true, status: "ok", freshnessMs: 3_600_000 });
    expect(stale.availability).toBe("stale");
    // Age is a property of the observation, not a reason to withhold the request.
    expect(isQueryable(stale)).toBe(true);
    const disconnected = fromFeedHealth({ connected: false, status: "socket closed" });
    expect(disconnected.availability).toBe("temporarily-unavailable");
    expect(isQueryable(disconnected)).toBe(false);
  });
});

/* ═══════ 2. Provider registry ═══════ */

describe("the provider matrix carries M2.8's providers", () => {
  const byId = new Map(DATA_SOURCE_MATRIX.map((s) => [s.id, s]));

  it("registers Trade Atlas as planned, alongside Volza", () => {
    expect(byId.get("trade_atlas")?.status).toBe("PLANNED");
    expect(byId.get("trade_atlas")?.kind).toBe("trade");
    // Volza survives — Trade Atlas is a second independent source, not a
    // replacement, and neither is primary.
    expect(byId.get("volza")?.status).toBe("ACTIVE");
    expect(byId.get("volza")?.kind).toBe("trade");
  });

  it("registers SeaVantage without claiming it is connected", () => {
    expect(byId.get("seavantage")?.status).toBe("PLANNED");
  });

  it("does not contain Kpler in any form", () => {
    const text = JSON.stringify(DATA_SOURCE_MATRIX).toLowerCase();
    expect(text).not.toContain("kpler");
  });

  it("exposes every provider with a translated reading and its own status", () => {
    const providers = getProviderAvailability();
    expect(providers.length).toBeGreaterThan(0);
    for (const p of providers) {
      expect(p.reading.providerStatus).toBeTruthy();
      expect(p.reading.reason).toBeTruthy();
    }
  });

  it("lets the AIS registry's more specific reading win over the matrix", () => {
    const datalastic = getProviderAvailability().find((p) => p.providerId === "datalastic");
    // The matrix says ACTIVE; the AIS registry says PENDING_CREDENTIALS,
    // which is the more specific and more honest answer.
    expect(datalastic?.reading.providerStatus).toBe("PENDING_CREDENTIALS");
    expect(datalastic?.reading.availability).toBe("credentials-required");
  });

  it("reports no queryable AIS provider while none is connected", () => {
    expect(queryableProviders("ais")).toHaveLength(0);
  });
});

/* ═══════ 3. The four states of absence ═══════ */

describe("the broker never collapses absence into one empty state", () => {
  it("reports unsupported for an attribute no provider kind serves", () => {
    const out = getVesselIntelligence(IMO, "vessel.hull_paint_colour");
    expect(out.state).toBe("unsupported");
    expect(out.evidence).toHaveLength(0);
    expect(out.reason).toMatch(/No provider kind/i);
  });

  it("reports unavailable — with the underlying reason — when providers exist but cannot be reached", () => {
    const out = getVesselPosition(IMO);
    expect(out.state).toBe("unavailable");
    expect(out.providers.length).toBeGreaterThan(0);
    // The crucial part: "unavailable" must not hide "PENDING_CREDENTIALS".
    expect(out.reason).toMatch(/PENDING_CREDENTIALS/);
  });

  it("reports empty when a provider was queried and reported nothing", () => {
    const out = getVesselIntelligence(IMO, "trade.flow", () => []);
    // Volza is ACTIVE, so trade has a queryable provider.
    expect(out.state).toBe("empty");
    expect(out.reason).toMatch(/none reported anything/i);
  });

  it("reports ready with scored evidence when providers answer", () => {
    const out = getVesselIntelligence(IMO, "trade.flow", () => [
      evidence({ id: "t1", sourceSystem: "Volza", attribute: "trade.flow", value: "1200 TEU" }),
    ]);
    expect(out.state).toBe("ready");
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0].confidence).toBeGreaterThan(0);
  });

  it("fabricates nothing when no provider is connected", () => {
    const out = getVesselPosition(IMO);
    expect(out.evidence).toHaveLength(0);
    expect(out.conflicts).toHaveLength(0);
  });
});

/* ═══════ 4. Conflict preservation ═══════ */

describe("two providers disagreeing keeps both", () => {
  it("preserves both observations and records the contradiction", () => {
    const out = getVesselIntelligence(IMO, "trade.flow", () => [
      evidence({
        id: "a",
        sourceSystem: "Volza",
        attribute: "trade.flow",
        value: "1200 TEU",
        contentHash: "ha",
      }),
      evidence({
        id: "b",
        sourceSystem: "TradeAtlas",
        attribute: "trade.flow",
        value: "1450 TEU",
        contentHash: "hb",
      }),
    ]);

    expect(out.state).toBe("ready");
    // Neither is discarded.
    expect(out.evidence).toHaveLength(2);
    expect(out.evidence.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(out.conflicts.length).toBeGreaterThan(0);
    expect(out.reason).toMatch(/contradiction/i);
    // Each side can be traced back to who said it.
    expect(out.evidence.map((e) => e.sourceSystem).sort()).toEqual(["TradeAtlas", "Volza"]);
  });

  it("ranks by confidence without dropping the loser", () => {
    const old = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const out = getVesselIntelligence(IMO, "trade.flow", () => [
      evidence({
        id: "stale",
        sourceSystem: "Volza",
        attribute: "trade.flow",
        value: "1",
        collectedAt: old,
        contentHash: "h1",
      }),
      evidence({
        id: "fresh",
        sourceSystem: "Volza",
        attribute: "trade.flow",
        value: "2",
        contentHash: "h2",
      }),
    ]);
    expect(out.evidence[0].id).toBe("fresh");
    expect(out.evidence).toHaveLength(2);
  });
});

/* ═══════ 5. Property-specific authority ═══════ */

describe("authority depends on what is being claimed", () => {
  it("ranks an AIS source above a sanctions source for position", () => {
    const ais = authorityScore("Datalastic", "vessel.position");
    const sanctions = authorityScore("OpenSanctions", "vessel.position");
    expect(ais).toBeGreaterThan(sanctions);
  });

  it("reverses that ranking for a sanctions designation", () => {
    // The same two providers, the opposite order — which is the entire
    // reason a single global table was insufficient.
    const ais = authorityScore("Datalastic", "entity.sanctions");
    const sanctions = authorityScore("OpenSanctions", "entity.sanctions");
    expect(sanctions).toBeGreaterThan(ais);
  });

  it("keeps the two trade providers level rather than picking a primary", () => {
    expect(authorityScore("TradeAtlas", "trade.flow")).toBe(authorityScore("Volza", "trade.flow"));
  });

  it("falls back to the global table when an attribute has no opinion", () => {
    // Backward compatibility: the one-argument form is untouched.
    expect(authorityScore("OpenSanctions")).toBe(0.95);
    expect(authorityScore("OpenSanctions", "some.unlisted.attribute")).toBe(0.95);
    expect(authorityScore("NeverHeardOf")).toBe(0.7);
  });

  it("lets an explicit override win over both tables", () => {
    expect(
      authorityScore("OpenSanctions", "vessel.position", {
        authorityOverrides: { OpenSanctions: 0.99 },
      }),
    ).toBe(0.99);
  });

  it("prefers the longest matching attribute prefix", () => {
    // `vessel.position.lat` is governed by `vessel.position`.
    expect(authorityScore("Datalastic", "vessel.position.lat")).toBe(
      authorityScore("Datalastic", "vessel.position"),
    );
  });
});

/* ═══════ 6. Canonical identity ═══════ */

describe("vessel identity is anchored on IMO and never guessed", () => {
  let index: VesselIdentityIndex;
  beforeEach(() => {
    index = new VesselIdentityIndex();
  });

  it("normalises the conventional IMO spellings", () => {
    expect(normalizeImo("9111111")).toBe("9111111");
    expect(normalizeImo("IMO 9111111")).toBe("9111111");
    expect(normalizeImo("imo-9111111")).toBe("9111111");
  });

  it("refuses anything that is not seven digits", () => {
    // An MMSI is nine digits and would otherwise be silently accepted.
    expect(normalizeImo("123456789")).toBeNull();
    expect(normalizeImo("ABCDEFG")).toBeNull();
    expect(normalizeImo("")).toBeNull();
    expect(normalizeImo(null)).toBeNull();
  });

  it("resolves a provider's own record id back to the canonical vessel", () => {
    index.upsert({
      imo: IMO,
      providerAliases: [
        {
          provider: "datalastic",
          providerId: "dl-8814",
          confidence: "VERIFIED",
          source: "test",
          linkedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(index.getByProviderId("datalastic", "dl-8814")?.imo).toBe(IMO);
    // A provider id is not itself an identity.
    expect(index.getByImo("dl-8814")).toBeNull();
  });

  it("merges aliases from several providers onto one vessel", () => {
    index.upsert({
      imo: IMO,
      names: ["OCEAN PEARL"],
      providerAliases: [
        {
          provider: "datalastic",
          providerId: "dl-1",
          confidence: "VERIFIED",
          source: "t",
          linkedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    index.upsert({
      imo: IMO,
      names: ["OCEAN PEARL", "FORMER NAME"],
      providerAliases: [
        {
          provider: "seavantage",
          providerId: "sv-9",
          confidence: "OBSERVED",
          source: "t",
          linkedAt: "2026-01-02T00:00:00Z",
        },
      ],
    });
    const vessel = index.getByImo(IMO);
    expect(vessel?.providerAliases.map((a) => a.provider).sort()).toEqual([
      "datalastic",
      "seavantage",
    ]);
    // Neither provider erased the other's contribution.
    expect(vessel?.names).toContain("OCEAN PEARL");
    expect(vessel?.names).toContain("FORMER NAME");
  });

  it("surfaces two ids from one provider as a conflict rather than resolving it", () => {
    index.upsert({
      imo: IMO,
      providerAliases: [
        {
          provider: "datalastic",
          providerId: "dl-1",
          confidence: "OBSERVED",
          source: "t",
          linkedAt: "2026-01-01T00:00:00Z",
        },
        {
          provider: "datalastic",
          providerId: "dl-2",
          confidence: "INFERRED",
          source: "t",
          linkedAt: "2026-01-02T00:00:00Z",
        },
      ],
    });
    const conflicts = index.conflictingAliases(IMO);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.providerId).sort()).toEqual(["dl-1", "dl-2"]);
  });

  it("carries identity confidence on every alias", () => {
    index.upsert({
      imo: IMO,
      providerAliases: [
        {
          provider: "datalastic",
          providerId: "dl-1",
          confidence: "INFERRED",
          source: "t",
          linkedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(index.aliasFor(IMO, "datalastic")?.confidence).toBe("INFERRED");
    // An alias we do not hold is null, not an empty guess.
    expect(index.aliasFor(IMO, "seavantage")).toBeNull();
  });

  it("rejects an unusable IMO instead of inventing a record", () => {
    expect(index.upsert({ imo: "not-an-imo" })).toBeNull();
    expect(index.size).toBe(0);
  });

  it("ships empty — no vessel identities are seeded", () => {
    // M2.8 is infrastructure. A populated index would be fabricated data.
    expect(vesselIdentityIndex.size).toBe(0);
  });
});

/* ═══════ 7. M2.9 — capability discovery and startup isolation ═══════ */

describe("capability discovery respects the domain boundary", () => {
  it("reports the AIS providers as supported but unconfigured for position", () => {
    // Supported: they are AIS sources and vessel.position routes to AIS.
    // Not ready: neither has credentials.
    for (const id of ["datalastic", "seavantage"]) {
      const answer = canQuery(id, "vessel.position");
      expect(answer.verdict).toBe("SUPPORTED_BUT_NOT_CONFIGURED");
      expect(answer.providerStatus).toBe("PENDING_CREDENTIALS");
    }
  });

  it("refuses to let a trade source answer a vessel position", () => {
    // The boundary that stops a future caller routing a position request
    // to whichever provider happens to be connected.
    const answer = canQuery("trade_atlas", "vessel.position");
    expect(answer.verdict).toBe("UNSUPPORTED");
    expect(answer.reason).toMatch(/does not serve/i);
  });

  it("refuses to let a sanctions source answer a vessel position", () => {
    expect(canQuery("sanctions", "vessel.position").verdict).toBe("UNSUPPORTED");
  });

  it("refuses to let an AIS source answer a sanctions question", () => {
    expect(canQuery("datalastic", "entity.sanctions").verdict).toBe("UNSUPPORTED");
  });

  it("reports a connected in-domain provider as ready", () => {
    expect(canQuery("volza", "trade.flow").verdict).toBe("SUPPORTED_AND_READY");
    expect(canQuery("sanctions", "entity.sanctions").verdict).toBe("SUPPORTED_AND_READY");
  });

  it("reports a planned in-domain provider as planned, not unsupported", () => {
    // Trade Atlas will serve trade.flow — it simply is not contracted yet.
    expect(canQuery("trade_atlas", "trade.flow").verdict).toBe("PLANNED");
  });

  it("treats an unregistered provider as unsupported rather than assuming capability", () => {
    const answer = canQuery("kpler", "vessel.position");
    expect(answer.verdict).toBe("UNSUPPORTED");
    expect(answer.providerStatus).toBeNull();
  });
});

describe("provider state never becomes application state", () => {
  it("leaves unrelated capabilities usable when AIS is unconfigured", () => {
    // The isolation requirement: AIS being unavailable must not take
    // sanctions or trade down with it.
    expect(getVesselPosition("9111111").state).toBe("unavailable");
    expect(canQuery("sanctions", "entity.sanctions").verdict).toBe("SUPPORTED_AND_READY");
    expect(canQuery("volza", "trade.flow").verdict).toBe("SUPPORTED_AND_READY");
  });

  it("exposes no credential values anywhere in a provider reading", () => {
    // Only names and statuses may cross this boundary. A value-shaped
    // string here would mean a secret had reached client-reachable code.
    const serialised = JSON.stringify(getProviderAvailability());
    expect(serialised).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^"']{8,}/i);
    expect(serialised).not.toMatch(/bearer\s+[A-Za-z0-9._-]{16,}/i);
  });

  it("issues no provider request merely by asking what is available", () => {
    // Capability discovery is metadata-only. If reading the registry
    // could trigger a connection, a page render would consume rate limit.
    const before = getProviderAvailability();
    const after = getProviderAvailability();
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
