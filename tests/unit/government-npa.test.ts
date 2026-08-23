import { describe, expect, it } from "vitest";

import {
  GovernmentDataSourceRegistry,
  GovernmentRegistryError,
  NOSDRA_OIL_SPILL,
  NPA_DATASETS,
  NPA_SHIPPOS,
  NpaShipposAdapter,
  arrivedUnscheduled,
  buildPortCall,
  deriveStage,
  expectedNotArrived,
  isAuthoritativeFor,
  isValidImo,
  matchAisToSchedule,
  parseNpaDate,
  rankByAuthority,
  sourceAuthority,
  type AisPosition,
  type PortAnchor,
  type PortSchedule,
} from "@/services/government";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

const LAGOS: PortAnchor = {
  portId: "ngapp",
  name: "Lagos",
  latitude: 6.44,
  longitude: 3.38,
};

function adapter() {
  return new NpaShipposAdapter();
}

/* ─────────────── registry keeps NPA despite the 403 ─────────────── */

describe("Government Data Source Registry", () => {
  it("keeps NPA registered at priority 1 even though crawlers are blocked", () => {
    // The whole point: a fact about our client is not a verdict on their data.
    expect(NPA_SHIPPOS.priority).toBe(1);
    expect(NPA_SHIPPOS.crawlerAccess).toBe("BLOCKED");
    expect(NPA_SHIPPOS.portalAccess).toBe("AVAILABLE");
    expect(NPA_SHIPPOS.institutionalIntegration).toBe("REQUIRES_AUTHORIZATION");
  });

  it("separates crawler access from integration readiness", () => {
    // Blocked to bots, available to people, pending verification for
    // machines — three answers, not one status.
    expect(NPA_SHIPPOS.crawlerAccess).not.toBe(NPA_SHIPPOS.portalAccess);
    expect(NPA_SHIPPOS.automatedIntegration).toBe("PENDING_VERIFICATION");
  });

  it("records that no API documentation was found rather than inventing one", () => {
    expect(NPA_SHIPPOS.apiUrl).toBeNull();
    expect(NPA_SHIPPOS.documentationUrl).toBeNull();
    expect(NPA_SHIPPOS.notes.join(" ")).toMatch(/NPA_API_DOCUMENTATION_NOT_FOUND/);
  });

  it("marks operator-supplied field lists as unverified", () => {
    for (const dataset of NPA_SHIPPOS.datasets) {
      expect(dataset.fieldsBasis).toBe("OPERATOR_SUPPLIED");
    }
  });

  it("registers all four NPA datasets", () => {
    expect(NPA_SHIPPOS.datasets.map((d) => d.datasetId)).toEqual([
      NPA_DATASETS.expected,
      NPA_DATASETS.awaitingBerth,
      NPA_DATASETS.atBerth,
      NPA_DATASETS.departed,
    ]);
  });

  it("orders acquisition routes with export first and no scraping", () => {
    expect(NPA_SHIPPOS.integrationMethod[0]).toBe("PUBLIC_EXPORT");
    expect(NPA_SHIPPOS.integrationMethod).not.toContain("SCRAPE");
  });

  it("refuses a source claiming CONNECTED without a verified integration", () => {
    const registry = new GovernmentDataSourceRegistry();
    expect(() =>
      registry.register({
        ...NPA_SHIPPOS,
        sourceId: "fake",
        status: "EXPORT_CONNECTED",
        automatedIntegration: "REQUIRES_AUTHORIZATION",
      }),
    ).toThrow(GovernmentRegistryError);
  });

  it("lists sources an agreement could unlock", () => {
    const registry = new GovernmentDataSourceRegistry().registerAll([
      NPA_SHIPPOS,
      NOSDRA_OIL_SPILL,
    ]);
    expect(registry.awaitingAuthorization().map((s) => s.sourceId)).toContain("npa-shippos");
  });

  it("flags every unreviewed licence, including the connectable source", () => {
    const registry = new GovernmentDataSourceRegistry().registerAll([
      NPA_SHIPPOS,
      NOSDRA_OIL_SPILL,
    ]);
    // Publicly downloadable is not commercially reusable.
    expect(registry.licenseReview().map((s) => s.sourceId)).toContain("nosdra-oil-spill-monitor");
  });
});

/* ──────────────── adapter is inert without a route ──────────────── */

describe("NpaShipposAdapter — unconfigured", () => {
  it("reports NOT_CONFIGURED rather than an empty schedule", async () => {
    // "No vessels expected" and "we have no access" must never look alike.
    const result = await adapter().fetchExpectedVessels();

    expect(result.records).toEqual([]);
    expect(result.health).toBe("NOT_CONFIGURED");
    expect(result.route).toBeNull();
    expect(result.unavailableReason).toMatch(/No conclusion should be drawn/);
  });

  it("says the same for every dataset", async () => {
    const a = adapter();
    for (const fetchFn of [
      () => a.fetchAwaitingBerth(),
      () => a.fetchAtBerth(),
      () => a.fetchDeparted(),
    ]) {
      const result = await fetchFn();
      expect(result.health).toBe("NOT_CONFIGURED");
      expect(result.records).toEqual([]);
    }
  });

  it("explains historical access separately", async () => {
    const result = await adapter().fetchHistorical(
      NPA_DATASETS.expected,
      "2026-01-01",
      "2026-02-01",
    );
    expect(result.unavailableReason).toMatch(/requires NPA authorization/);
  });

  it("discovers no configured routes and names the priority order", () => {
    const report = adapter().discover();

    expect(report.configuredRoutes).toEqual([]);
    expect(report.unconfiguredRoutes[0]).toBe("PUBLIC_EXPORT");
    expect(report.notes.join(" ")).toMatch(/PUBLIC_EXPORT → OFFICIAL_API/);
  });

  it("health-checks as NOT_CONFIGURED", async () => {
    expect((await adapter().healthCheck()).health).toBe("NOT_CONFIGURED");
  });

  it("turns on when a route is supplied, with no other change", () => {
    const a = adapter().configureRoute({
      route: "PUBLIC_EXPORT",
      url: "https://example.invalid/export.json",
      format: "JSON",
    });

    expect(a.discover().configuredRoutes).toEqual(["PUBLIC_EXPORT"]);
    expect(a.getStatus()).toBe("UP");
  });

  it("blocks on licence review once a route exists", async () => {
    const a = adapter().configureRoute({
      route: "PUBLIC_EXPORT",
      url: "https://example.invalid/export.json",
    });
    expect((await a.healthCheck()).health).toBe("LICENSE_REVIEW");
  });
});

/* ───────────────────────── normalisation ────────────────────────── */

describe("NpaShipposAdapter — normalisation", () => {
  const row = {
    Vessel: "MV ABC",
    "IMO Number": "9074729",
    Terminal: "Apapa",
    ETA: "18/08/2026 16:30",
    Length: "180",
    Agent: "Acme Shipping",
    Cargo: "Containers",
    Tonnage: "28,730",
  };

  it("preserves VESSEL → EXPECTED → PORT → TERMINAL as one event", () => {
    // The brief's central constraint: not flattened onto the vessel.
    const [record] = adapter().normalize([row], NPA_DATASETS.expected);

    expect(record.vessel.name).toBe("MV ABC");
    expect(record.stage).toBe("EXPECTED");
    expect(record.terminalName).toBe("Apapa");
    expect(record.eta).toBe("2026-08-18T16:30:00.000Z");
  });

  it("tolerates the column-naming variants an unverified schema implies", () => {
    const variants = [
      { vessel: "MV ABC", imo_number: "9074729" },
      { Vessel: "MV ABC", IMO: "9074729" },
      { "vessel name": "MV ABC", imo: "9074729" },
    ];
    for (const variant of variants) {
      const [record] = adapter().normalize([variant], NPA_DATASETS.expected);
      expect(record.vessel.imo).toBe("9074729");
    }
  });

  it("reads day-first dates, the Nigerian convention", () => {
    // Month-first would shift most dates by weeks, silently.
    expect(parseNpaDate("18/08/2026")).toBe("2026-08-18T00:00:00.000Z");
    expect(parseNpaDate("2026-08-18T16:30:00Z")).toBe("2026-08-18T16:30:00.000Z");
  });

  it("returns null for an unparseable date rather than guessing", () => {
    expect(parseNpaDate("next tuesday")).toBeNull();
    expect(parseNpaDate("18/13/2026")).toBeNull();
    expect(parseNpaDate("")).toBeNull();
  });

  it("validates the IMO check digit", () => {
    expect(isValidImo("9074729")).toBe(true);
    expect(isValidImo("9074728")).toBe(false);
    expect(isValidImo("123")).toBe(false);
  });

  it("drops an IMO that fails its check digit rather than storing it", () => {
    // A wrong IMO would merge two different vessels.
    const [record] = adapter().normalize(
      [{ ...row, "IMO Number": "9074728" }],
      NPA_DATASETS.expected,
    );
    expect(record.vessel.imo).toBeNull();
    expect(record.confidence).toBeLessThan(0.95);
  });

  it("strips thousands separators from tonnage", () => {
    const [record] = adapter().normalize([row], NPA_DATASETS.expected);
    expect(record.tonnage).toBe(28730);
  });

  it("drops a row that names no vessel", () => {
    expect(adapter().normalize([{ Terminal: "Apapa" }], NPA_DATASETS.expected)).toEqual([]);
  });

  it("stamps provenance on every record", () => {
    const [record] = adapter().normalize([row], NPA_DATASETS.expected);

    expect(record.source).toBe("npa-shippos");
    expect(record.sourceUrl).toBe("https://shippos.nigerianports.gov.ng/");
    expect(record.schemaVersion).toBe("npa.portschedule.v1");
    expect(record.contentHash).toBeTruthy();
    expect(record.retrievedAt).toBeTruthy();
  });

  it("assigns the right stage per dataset", () => {
    const a = adapter();
    expect(a.normalize([row], NPA_DATASETS.atBerth)[0].stage).toBe("AT_BERTH");
    expect(a.normalize([row], NPA_DATASETS.departed)[0].stage).toBe("DEPARTED");
    expect(a.normalize([row], NPA_DATASETS.awaitingBerth)[0].stage).toBe("AWAITING_BERTH");
  });

  it("rejects implausible records without discarding them silently", () => {
    const a = adapter();
    const records = a.normalize(
      [
        { ...row, Length: "900" },
        { ...row, Tonnage: "-5" },
      ],
      NPA_DATASETS.expected,
    );
    const { valid, rejected } = a.validate(records);

    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toMatch(/Implausible length|Negative tonnage/);
  });

  it("de-duplicates identical rows by content hash", () => {
    const a = adapter();
    const records = a.normalize([row, { ...row }], NPA_DATASETS.expected);
    expect(a.deduplicate(records)).toHaveLength(1);
  });
});

/* ─────────────────── entity resolution & fusion ─────────────────── */

function schedule(over: Partial<PortSchedule> = {}): PortSchedule {
  const [record] = new NpaShipposAdapter().normalize(
    [
      {
        Vessel: "MV ABC",
        "IMO Number": "9074729",
        Terminal: "Apapa",
        ETA: "20/08/2026 16:30",
      },
    ],
    NPA_DATASETS.expected,
  );
  return { ...record, ...over };
}

function position(over: Partial<AisPosition> = {}): AisPosition {
  return {
    mmsi: "657123400",
    imo: "9074729",
    name: "MV ABC",
    latitude: 6.44,
    longitude: 3.38,
    speedKnots: 10,
    courseDeg: 20,
    reportedAt: new Date(NOW).toISOString(),
    source: "datalastic",
    ...over,
  };
}

describe("entity resolution", () => {
  it("matches on IMO first", () => {
    const match = matchAisToSchedule(schedule(), [position()]);
    expect(match?.method).toBe("imo");
    expect(match?.confidence).toBeGreaterThan(0.95);
  });

  it("falls back to MMSI", () => {
    const s = schedule({ vessel: { ...schedule().vessel, imo: null, mmsi: "657123400" } });
    const match = matchAisToSchedule(s, [position({ imo: null })]);
    expect(match?.method).toBe("mmsi");
  });

  it("never merges two vessels sharing a name", () => {
    // Abstaining is correct: picking one would put the wrong ship at the berth.
    const s = schedule({ vessel: { ...schedule().vessel, imo: null, mmsi: null } });
    const match = matchAisToSchedule(s, [
      position({ imo: null, mmsi: null }),
      position({ imo: null, mmsi: "999" }),
    ]);
    expect(match).toBeNull();
  });

  it("scores an exact-name match low, and only without identifiers", () => {
    const s = schedule({ vessel: { ...schedule().vessel, imo: null, mmsi: null } });
    const match = matchAisToSchedule(s, [position({ imo: null, mmsi: null })]);
    expect(match?.method).toBe("exact-name");
    expect(match?.confidence).toBeLessThan(0.6);
  });
});

describe("port call lifecycle", () => {
  it("keeps NPA authoritative for berth state", () => {
    const derived = deriveStage(schedule({ stage: "AT_BERTH" }), position(), LAGOS);
    expect(derived.stage).toBe("AT_BERTH");
    expect(derived.rationale).toMatch(/NPA is authoritative/);
  });

  it("lets AIS refine EXPECTED to APPROACHING", () => {
    // 30 nm out — inside the approach range.
    const derived = deriveStage(schedule(), position({ latitude: 5.94 }), LAGOS);
    expect(derived.stage).toBe("APPROACHING");
    expect(derived.sources).toContain("datalastic");
  });

  it("promotes to ARRIVED and notes NPA has not caught up", () => {
    const derived = deriveStage(schedule(), position(), LAGOS);
    expect(derived.stage).toBe("ARRIVED");
    expect(derived.rationale).toMatch(/NPA still lists it as expected/);
  });

  it("stays EXPECTED with no AIS match, and says why", () => {
    const derived = deriveStage(schedule(), null, LAGOS);
    expect(derived.stage).toBe("EXPECTED");
    expect(derived.rationale).toMatch(/No AIS position matched/);
  });

  it("keeps every conflicting ETA rather than reconciling them", () => {
    // NPA 16:30, provider 15:47 — two observations, not a disagreement to fix.
    const call = buildPortCall(
      schedule(),
      [position({ eta: "2026-08-20T15:47:00.000Z" })],
      LAGOS,
      NOW,
    );

    expect(call.etaObservations).toHaveLength(2);
    expect(new Set(call.etaObservations.map((e) => e.source))).toEqual(
      new Set(["npa-shippos", "datalastic"]),
    );
    // NPA outranks the AIS provider for a port schedule claim.
    expect(call.etaObservations[0].source).toBe("npa-shippos");
  });

  it("retains the schedule observation on the call", () => {
    const call = buildPortCall(schedule(), [position()], LAGOS, NOW);
    expect(call.scheduleObservations).toHaveLength(1);
    expect(call.terminalName).toBe("Apapa");
    expect(call.history[0].rationale).toBeTruthy();
  });

  it("finds expected vessels whose ETA has passed", () => {
    const call = buildPortCall(
      schedule({ eta: "2026-08-20T06:00:00.000Z" }),
      [position({ latitude: 5.0 })],
      LAGOS,
      NOW,
    );
    expect(expectedNotArrived([call], NOW)).toHaveLength(1);
  });

  it("finds arrivals that were never scheduled", () => {
    const unscheduled = arrivedUnscheduled(
      [position({ imo: "9319466", mmsi: "111", name: "MV GHOST" })],
      [schedule()],
      LAGOS,
    );
    expect(unscheduled).toHaveLength(1);
  });

  it("answers nothing about unscheduled arrivals when no schedule was retrieved", () => {
    // Without NPA access every arrival would look unscheduled, which would
    // be an artefact of our access, not a finding.
    expect(arrivedUnscheduled([position()], [], LAGOS)).toEqual([]);
  });
});

/* ────────────────────────── authority ───────────────────────────── */

describe("source authority", () => {
  it("is per claim, not per source", () => {
    expect(sourceAuthority("npa-shippos", "port-operational-state")).toBeGreaterThan(
      sourceAuthority("datalastic", "port-operational-state"),
    );
    expect(sourceAuthority("datalastic", "vessel-position")).toBeGreaterThan(
      sourceAuthority("npa-shippos", "vessel-position"),
    );
  });

  it("makes NPA authoritative for port state and AIS for position", () => {
    expect(isAuthoritativeFor("npa-shippos", "port-operational-state")).toBe(true);
    expect(isAuthoritativeFor("npa-shippos", "vessel-position")).toBe(false);
  });

  it("gives satellite zero authority over identity", () => {
    // A SAR return carries no identity. Consistent with services/eo.
    expect(sourceAuthority("sentinel-1", "vessel-identity")).toBe(0);
    expect(sourceAuthority("sentinel-1", "physical-observation")).toBeGreaterThan(0.8);
  });

  it("ranks without discarding", () => {
    const ranked = rankByAuthority(["datalastic", "npa-shippos"], "port-schedule");
    expect(ranked[0].sourceId).toBe("npa-shippos");
    expect(ranked).toHaveLength(2);
  });
});
