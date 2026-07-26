/**
 * Sprint EP-MASTER — Evidence Expansion Program regression suite.
 *
 * Each provider is exercised through the frozen five-method API with an
 * injected fetch stub: no network, no persistence, no UIP creation.
 */
import { describe, expect, it } from "vitest";
import { EvidenceCache } from "@/services/ial/cache";
import type { AcquisitionQuery } from "@/services/ial/types";
import { OpenCorporatesProvider } from "../implementations/OpenCorporatesProvider";
import { EquasisProvider } from "../implementations/EquasisProvider";
import { ImoGisisProvider } from "../implementations/ImoGisisProvider";
import { GlobalFishingWatchProvider } from "../implementations/GlobalFishingWatchProvider";
import { OfacProvider } from "../implementations/OfacProvider";
import { UnSecurityCouncilProvider } from "../implementations/UnSecurityCouncilProvider";
import { buildEvidenceProviderCatalog, formatCacheTtl } from "../catalog";

function jsonFetch(payload: unknown, status = 200): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function textFetch(body: string, status = 200): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const QUERY: AcquisitionQuery = { text: "OCEAN PEARL" };

describe("EP-02 · OpenCorporates", () => {
  it("normalizes a registry hit into ownership evidence", async () => {
    const { impl } = jsonFetch({
      results: {
        companies: [
          {
            company: {
              name: "Ocean Pearl Shipping Ltd",
              company_number: "1234567",
              jurisdiction_code: "gb",
              current_status: "Active",
              incorporation_date: "2011-04-02",
              opencorporates_url: "https://opencorporates.com/companies/gb/1234567",
              updated_at: "2026-01-04T00:00:00Z",
            },
          },
        ],
      },
    });
    const provider = new OpenCorporatesProvider({
      fetchImpl: impl,
      cache: new EvidenceCache(),
      credential: null,
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record.source).toBe("opencorporates");
    expect(record.kind).toBe("ownership");
    expect(record.fields.jurisdiction).toBe("GB");
    expect(record.hash).toBeTruthy();
    // Validator flags, never drops. No structural issues may be raised.
    const blocking = provider
      .validate(result.records)
      .issues.filter((issue) => issue.severity === "warn");
    expect(blocking).toHaveLength(0);
  });

  it("serves the second identical query from the frozen EvidenceCache", async () => {
    const { impl, calls } = jsonFetch({ results: { companies: [] } });
    const provider = new OpenCorporatesProvider({ fetchImpl: impl, cache: new EvidenceCache() });
    await provider.search(QUERY);
    await provider.search(QUERY);
    expect(calls).toHaveLength(1);
  });
});

describe("EP-03 · Equasis", () => {
  it("reports an explicit failure when credentials are absent (never simulates)", async () => {
    const { impl, calls } = jsonFetch({ ships: [] });
    const provider = new EquasisProvider({
      fetchImpl: impl,
      cache: new EvidenceCache(),
      credential: null,
      password: null,
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(false);
    expect(result.records).toHaveLength(0);
    expect(result.error).toMatch(/credentials not configured/i);
    expect(calls).toHaveLength(0);
  });

  it("normalizes ship particulars when credentialed", async () => {
    const { impl } = jsonFetch({
      ships: [
        {
          imo: "9123456",
          name: "MV OCEAN PEARL",
          flag: "Panama",
          grossTonnage: 32000,
          yearOfBuild: 2011,
          registeredOwner: "Ocean Pearl Shipping Ltd",
          statusDate: "2026-02-01T00:00:00Z",
        },
      ],
    });
    const provider = new EquasisProvider({
      fetchImpl: impl,
      cache: new EvidenceCache(),
      credential: "user",
      password: "secret",
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(true);
    expect(result.records[0].fields.imoNumber).toBe("9123456");
    expect(result.records[0].entity.kind).toBe("vessel");
  });
});

describe("EP-04 · IMO GISIS", () => {
  it("fails explicitly without a token", async () => {
    const provider = new ImoGisisProvider({
      fetchImpl: jsonFetch({}).impl,
      cache: new EvidenceCache(),
      credential: null,
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it("normalizes registry particulars including former names", async () => {
    const { impl } = jsonFetch({
      ships: [
        {
          imoNumber: 9123456,
          shipName: "OCEAN PEARL",
          formerNames: ["SEA PEARL", "PEARL I"],
          flag: "Panama",
          recordUpdated: "2026-03-01T00:00:00Z",
        },
      ],
    });
    const provider = new ImoGisisProvider({
      fetchImpl: impl,
      cache: new EvidenceCache(),
      credential: "token",
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(true);
    expect(result.records[0].fields.formerNames).toBe("SEA PEARL | PEARL I");
  });
});

describe("EP-06 · Global Fishing Watch", () => {
  it("normalizes AIS identity without characterising behaviour", async () => {
    const { impl } = jsonFetch({
      entries: [
        {
          selfReportedInfo: [
            {
              id: "abc-123",
              ssvid: "371234567",
              shipname: "OCEAN PEARL",
              flag: "PAN",
              lastTransmissionDate: "2026-07-20T10:00:00Z",
            },
          ],
        },
      ],
    });
    const provider = new GlobalFishingWatchProvider({
      fetchImpl: impl,
      cache: new EvidenceCache(),
      credential: "token",
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(true);
    const record = result.records[0];
    expect(record.fields.mmsi).toBe("371234567");
    expect(record.grade).toBe("REPORTED");
    expect(JSON.stringify(record.fields)).not.toMatch(/dark|suspicious|risk/i);
  });

  it("fails explicitly without a token", async () => {
    const provider = new GlobalFishingWatchProvider({
      fetchImpl: jsonFetch({}).impl,
      cache: new EvidenceCache(),
      credential: null,
    });
    expect((await provider.search(QUERY)).ok).toBe(false);
  });
});

const SDN_XML = `<sdnList><publshInformation><Publish_Date>07/20/2026</Publish_Date></publshInformation>
<sdnEntry><uid>44444</uid><lastName>OCEAN PEARL</lastName><sdnType>Vessel</sdnType>
<programList><program>IRAN</program></programList>
<vesselInfo><callSign>ABCD</callSign><vesselType>Crude Oil Tanker</vesselType><vesselFlag>Panama</vesselFlag></vesselInfo>
<idList><id><idType>IMO Number</idType><idNumber>9123456</idNumber></id></idList></sdnEntry>
<sdnEntry><uid>55555</uid><lastName>UNRELATED CO</lastName><sdnType>Entity</sdnType></sdnEntry></sdnList>`;

describe("EP-07 · OFAC", () => {
  it("extracts only matching SDN designations as primary-source evidence", async () => {
    const { impl } = textFetch(SDN_XML);
    const provider = new OfacProvider({ fetchImpl: impl, cache: new EvidenceCache() });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record.grade).toBe("VERIFIED");
    expect(record.fields.sanctionPrograms).toBe("IRAN");
    expect(record.fields.imoNumber).toBe("9123456");
    expect(record.entity.kind).toBe("vessel");
    const blocking = provider
      .validate(result.records)
      .issues.filter((issue) => issue.severity === "warn");
    expect(blocking).toHaveLength(0);
  });
});

const UN_XML = `<CONSOLIDATED_LIST><ENTITIES><ENTITY><DATAID>6908</DATAID>
<FIRST_NAME>OCEAN PEARL TRADING</FIRST_NAME><UN_LIST_TYPE>DPRK</UN_LIST_TYPE>
<REFERENCE_NUMBER>KPe.031</REFERENCE_NUMBER><LISTED_ON>2017-06-02</LISTED_ON>
<ENTITY_ALIAS><ALIAS_NAME>PEARL TRADING</ALIAS_NAME></ENTITY_ALIAS></ENTITY></ENTITIES></CONSOLIDATED_LIST>`;

describe("EP-08 · UN Security Council", () => {
  it("extracts matching consolidated-list designations", async () => {
    const { impl } = textFetch(UN_XML);
    const provider = new UnSecurityCouncilProvider({
      fetchImpl: impl,
      cache: new EvidenceCache(),
    });
    const result = await provider.search(QUERY);
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].fields.unReferenceNumber).toBe("KPe.031");
    expect(result.records[0].fields.sanctionPrograms).toBe("DPRK");
    expect(result.records[0].entity.kind).toBe("company");
  });
});

describe("EP-MASTER · Evidence Provider Catalog", () => {
  const catalog = buildEvidenceProviderCatalog();

  it("lists all eight integrated providers in sprint order", () => {
    expect(catalog.map((row) => row.providerId)).toEqual([
      "open-sanctions",
      "opencorporates",
      "equasis",
      "imo-gisis",
      "environmental-intelligence",
      "global-fishing-watch",
      "ofac",
      "un-security-council",
    ]);
  });

  it("reports every provider as certified against spec v1.0", () => {
    for (const row of catalog) {
      expect(row.certification, `${row.providerName}: ${row.certificationFailures.join("; ")}`).toBe(
        "CERTIFIED",
      );
      expect(row.specVersion).toBe("1.0");
      expect(row.capabilities.length).toBeGreaterThan(0);
      expect(row.dataSources.length).toBeGreaterThan(0);
      expect(row.projectionContractId).toMatch(/^ial\./);
      expect(row.testCoverage.length).toBeGreaterThan(0);
    }
  });

  it("declares credential environment variables whenever auth is required", () => {
    for (const row of catalog) {
      if (row.authentication === "none") expect(row.credentialEnv).toHaveLength(0);
      else expect(row.credentialEnv.length).toBeGreaterThan(0);
    }
  });

  it("names exactly one reference implementation", () => {
    expect(catalog.filter((row) => row.referenceImplementation)).toHaveLength(1);
  });

  it("formats cache TTLs for officer display", () => {
    expect(formatCacheTtl(3_600_000)).toBe("1h");
    expect(formatCacheTtl(86_400_000)).toBe("1d");
  });
});
