/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01B — Intelligence Object Model · Shared Types
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Canonical typed fields for every Intelligence Object kind.
 *  Extends the base MicEntityRegistryEntry — never replaces it.
 *
 *  Design rules:
 *    1. Every field is readonly and optional (providers supply partial data).
 *    2. Every field that carries a number has a unit in the units map.
 *    3. No computed fields — all values come from evidence.
 *    4. "Source" fields (sourceId, providerRecordId) are always present
 *       when the field was filled by a provider.
 *    5. Unknown / unresolved values are null — never fabricated defaults.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type { MicCitation, MicConfidenceTier } from "../types";

// ─────────────────────────────────────────────────────────────────────
//  BASE INTELLIGENCE OBJECT
// ─────────────────────────────────────────────────────────────────────

/**
 * Every Intelligence Object carries this base in addition to its
 * typed domain fields. Extends MicEntityRegistryEntry by embedding it.
 */
export interface IntelligenceObjectBase {
  readonly objectId: string; // == MicEntityRegistryEntry.canonicalId
  readonly objectKind: IntelligenceObjectKind;
  readonly label: string;
  readonly aliases: ReadonlyArray<string>;
  readonly confidence: MicConfidenceTier;
  readonly grade: EvidenceGrade;
  readonly citations: ReadonlyArray<MicCitation>;
  readonly sourceUipIds: ReadonlyArray<string>;
  readonly firstSeenAt: string | null; // ISO 8601
  readonly lastSeenAt: string | null; // ISO 8601
  readonly revision: number;
}

/**
 * All 20 Intelligence Object kinds defined by the INT-01B spec.
 * Grouped by domain for readability.
 */
export type IntelligenceObjectKind =
  // Maritime entities
  | "vessel"
  | "voyage"
  | "port"
  | "cargo"
  | "manifest"
  | "container"
  // Corporate / human entities
  | "company"
  | "person"
  | "director"
  | "owner"
  | "organisation"
  // Regulatory / compliance
  | "sanction"
  | "inspection"
  | "incident"
  | "document"
  // Environmental / spatial
  | "satellite-observation"
  | "weather-event"
  | "location"
  // Financial / operational
  | "insurance"
  | "classification-society"
  | "terminal"
  | "bill-of-lading"
  | "importer"
  | "exporter"
  | "consignee";

// ─────────────────────────────────────────────────────────────────────
//  MARITIME INTELLIGENCE OBJECTS
// ─────────────────────────────────────────────────────────────────────

/** Typed attributes for a Vessel Intelligence Object. */
export interface VesselAttributes {
  // Identity
  readonly imoNumber: string | null;
  readonly mmsi: string | null;
  readonly callSign: string | null;
  readonly name: string | null;
  readonly formerNames: ReadonlyArray<string>;
  // Registration
  readonly flag: string | null; // ISO 3166-1 alpha-2
  readonly flagState: string | null; // full country name
  readonly registrationPort: string | null;
  readonly registrationNumber: string | null;
  // Classification
  readonly vesselType: string | null;
  readonly vesselSubtype: string | null;
  readonly grossTonnage: number | null; // GT
  readonly netTonnage: number | null; // NT
  readonly deadweightTonnage: number | null; // DWT
  readonly lengthOverall: number | null; // metres
  readonly breadth: number | null; // metres
  readonly draft: number | null; // metres
  readonly yearBuilt: number | null;
  readonly buildCountry: string | null;
  readonly builderName: string | null;
  // Class
  readonly classificationSociety: string | null;
  readonly classNotation: string | null;
  // Status
  readonly status: "active" | "laid-up" | "scrapped" | "total-loss" | "unknown" | null;
}

/** Typed attributes for a Voyage Intelligence Object. */
export interface VoyageAttributes {
  readonly voyageNumber: string | null;
  readonly departurePort: string | null;
  readonly departurePortUnlocode: string | null;
  readonly departureTime: string | null; // ISO 8601
  readonly arrivalPort: string | null;
  readonly arrivalPortUnlocode: string | null;
  readonly arrivalTime: string | null; // ISO 8601
  readonly estimatedArrival: string | null; // ISO 8601
  readonly vesselId: string | null; // canonical vessel entity id
  readonly cargo: string | null;
  readonly draught: number | null; // metres
  readonly speed: number | null; // knots
  readonly heading: number | null; // degrees
  readonly status: "underway" | "at-anchor" | "moored" | "not-under-command" | "unknown" | null;
}

/** Typed attributes for a Port Intelligence Object. */
export interface PortAttributes {
  readonly unlocode: string | null;
  readonly name: string | null;
  readonly countryCode: string | null;
  readonly countryName: string | null;
  readonly latitude: number | null; // degrees
  readonly longitude: number | null; // degrees
  readonly portType: string | null; // "seaport" | "anchorage" | "inland"
  readonly timeZone: string | null;
  readonly maximumVesselSize: number | null; // GT
}

/** Typed attributes for a Cargo Intelligence Object. */
export interface CargoAttributes {
  readonly description: string | null;
  readonly hsCode: string | null;
  readonly hsDescription: string | null;
  readonly quantity: number | null;
  readonly quantityUnit: string | null; // "MT" | "TEU" | "CBM" | etc.
  readonly weight: number | null; // kg
  readonly value: number | null; // NGN
  readonly currency: string | null;
  readonly consignorId: string | null; // canonical company entity id
  readonly consigneeId: string | null; // canonical company entity id
  readonly originCountry: string | null;
  readonly destinationCountry: string | null;
  readonly dangerousGoods: boolean | null;
  readonly imdgClass: string | null; // for DG cargo
}

/** Typed attributes for a Manifest Intelligence Object. */
export interface ManifestAttributes {
  readonly manifestNumber: string | null;
  readonly declarationDate: string | null; // ISO 8601
  readonly portOfLoading: string | null;
  readonly portOfDischarge: string | null;
  readonly vesselId: string | null;
  readonly voyageId: string | null;
  readonly totalItems: number | null;
  readonly totalWeight: number | null; // kg
  readonly totalValue: number | null; // NGN
  readonly status: "declared" | "amended" | "validated" | "contested" | null;
}

/** Typed attributes for a Container Intelligence Object. */
export interface ContainerAttributes {
  readonly containerNumber: string | null; // ISO 6346
  readonly containerType: string | null; // 20GP | 40GP | 40HC | etc.
  readonly sealNumber: string | null;
  readonly tare: number | null; // kg
  readonly maxPayload: number | null; // kg
  readonly vesselId: string | null;
  readonly manifestId: string | null;
  readonly status: "loaded" | "discharged" | "in-transit" | "empty" | null;
}

// ─────────────────────────────────────────────────────────────────────
//  CORPORATE / HUMAN INTELLIGENCE OBJECTS
// ─────────────────────────────────────────────────────────────────────

/** Typed attributes for a Company Intelligence Object. */
export interface CompanyAttributes {
  readonly registeredName: string | null;
  readonly tradingName: string | null;
  readonly registrationNumber: string | null;
  readonly registrationCountry: string | null;
  readonly registrationDate: string | null; // ISO 8601 date
  readonly leiCode: string | null; // Legal Entity Identifier
  readonly cacNumber: string | null; // Nigeria CAC number
  readonly companyType: string | null; // "llc" | "plc" | "partnership" etc.
  readonly status: "active" | "dissolved" | "dormant" | "unknown" | null;
  readonly ultimateBeneficialOwner: string | null; // canonical person entity id
  readonly incorporationCountry: string | null;
  readonly address: string | null;
  readonly website: string | null;
}

/** Typed attributes for a Person Intelligence Object. */
export interface PersonAttributes {
  readonly fullName: string | null;
  readonly formerNames: ReadonlyArray<string>;
  readonly nationality: string | null;
  readonly dateOfBirth: string | null; // ISO 8601 date (YYYY-MM-DD)
  readonly placeOfBirth: string | null;
  readonly passportNumber: string | null;
  readonly seafarerBookNumber: string | null; // Continuous Discharge Certificate
  readonly rank: string | null;
  readonly nationality2: string | null; // dual nationality
}

/** Typed attributes for a Director Intelligence Object. */
export interface DirectorAttributes {
  readonly personId: string | null; // canonical person entity id
  readonly companyId: string | null; // canonical company entity id
  readonly role: string | null; // "director" | "secretary" | "CEO" etc.
  readonly appointedDate: string | null; // ISO 8601 date
  readonly resignedDate: string | null; // ISO 8601 date; null = still active
  readonly nationality: string | null;
}

/** Typed attributes for an Owner Intelligence Object. */
export interface OwnerAttributes {
  readonly entityId: string | null; // canonical company or person id
  readonly entityKind: "company" | "person" | null;
  readonly ownershipType: "registered" | "beneficial" | "bareboat" | "time-charter" | null;
  readonly ownershipPercentage: number | null; // 0-100
  readonly effectiveDate: string | null;
  readonly expiryDate: string | null;
}

/** Typed attributes for an Organisation Intelligence Object. */
export interface OrganisationAttributes {
  readonly name: string | null;
  readonly type: "government" | "intergovernmental" | "ngo" | "regulatory" | "other" | null;
  readonly country: string | null;
  readonly mandate: string | null;
  readonly website: string | null;
}

// ─────────────────────────────────────────────────────────────────────
//  REGULATORY / COMPLIANCE INTELLIGENCE OBJECTS
// ─────────────────────────────────────────────────────────────────────

/** Typed attributes for a Sanction Intelligence Object. */
export interface SanctionAttributes {
  readonly sanctionListName: string | null; // "OFAC SDN" | "UNSC Consolidated" | "OpenSanctions"
  readonly sanctionListId: string | null;
  readonly entityId: string | null; // canonical entity being sanctioned
  readonly entityKind: "vessel" | "company" | "person" | null;
  readonly effectiveDate: string | null; // ISO 8601 date
  readonly expiryDate: string | null; // null = indefinite
  readonly reason: string | null;
  readonly programmeName: string | null; // "IRAN" | "RUSSIA" | "DPRK" etc.
  readonly status: "active" | "expired" | "delisted" | null;
}

/** Typed attributes for an Inspection Intelligence Object. */
export interface InspectionAttributes {
  readonly vesselId: string | null;
  readonly portId: string | null;
  readonly inspectionDate: string | null; // ISO 8601
  readonly inspectionType: "PSC" | "flag" | "class" | "internal" | "ISM" | null;
  readonly authority: string | null;
  readonly result: "passed" | "deficiencies" | "detained" | "failed" | null;
  readonly deficiencies: number | null;
  readonly detentionDays: number | null;
  readonly notes: string | null;
}

/** Typed attributes for an Incident Intelligence Object. */
export interface IncidentAttributes {
  readonly incidentType:
    | "collision"
    | "grounding"
    | "fire"
    | "flooding"
    | "explosion"
    | "piracy"
    | "pollution"
    | "other"
    | null;
  readonly incidentDate: string | null; // ISO 8601
  readonly location: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly vesselId: string | null;
  readonly severity: "minor" | "moderate" | "serious" | "very-serious" | null;
  readonly casualties: number | null;
  readonly description: string | null;
  readonly reportingAuthority: string | null;
}

/** Typed attributes for a Document Intelligence Object. */
export interface DocumentAttributes {
  readonly documentType:
    | "certificate"
    | "licence"
    | "permit"
    | "declaration"
    | "bill-of-lading"
    | "manifest"
    | "other"
    | null;
  readonly documentNumber: string | null;
  readonly issuingAuthority: string | null;
  readonly issuingCountry: string | null;
  readonly issuedDate: string | null; // ISO 8601
  readonly expiryDate: string | null; // ISO 8601; null = no expiry
  readonly subject: string | null; // what / whom the document covers
  readonly status: "valid" | "expired" | "suspended" | "revoked" | null;
}

// ─────────────────────────────────────────────────────────────────────
//  ENVIRONMENTAL / SPATIAL INTELLIGENCE OBJECTS
// ─────────────────────────────────────────────────────────────────────

/** Typed attributes for a Satellite Observation Intelligence Object. */
export interface SatelliteObservationAttributes {
  readonly sceneId: string | null;
  readonly collection: string | null; // "SENTINEL-1" | "SENTINEL-2" | etc.
  readonly platform: string | null;
  readonly acquisitionTime: string | null; // ISO 8601
  readonly centroidLatitude: number | null; // degrees
  readonly centroidLongitude: number | null; // degrees
  readonly bboxWest: number | null;
  readonly bboxSouth: number | null;
  readonly bboxEast: number | null;
  readonly bboxNorth: number | null;
  readonly cloudCover: number | null; // % (Sentinel-2)
  readonly sarMode: string | null; // "IW" | "EW" | "SM" (Sentinel-1)
  readonly sarPolarisation: string | null; // "VV" | "VH" | "DV"
  readonly groundSamplingDistance: number | null; // metres
  readonly license: string | null;
  readonly thumbnailHref: string | null;
}

/** Typed attributes for a Weather Event Intelligence Object. */
export interface WeatherEventAttributes {
  readonly observationTime: string | null; // ISO 8601
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly waveHeight: number | null; // metres
  readonly windSpeed: number | null; // knots
  readonly windDirection: number | null; // degrees
  readonly visibility: number | null; // metres
  readonly seaSurfaceTemp: number | null; // °C
  readonly swellHeight: number | null; // metres
  readonly swellPeriod: number | null; // seconds
  readonly sourceModel: string | null; // "Open-Meteo Marine" | "NOAA"
}

/** Typed attributes for a Location Intelligence Object. */
export interface LocationAttributes {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly name: string | null;
  readonly unlocode: string | null;
  readonly countryCode: string | null;
  readonly locationType: "port" | "anchorage" | "waypoint" | "coastline" | "maritime-zone" | null;
  readonly maritimeZone: "territorial-sea" | "contiguous-zone" | "eez" | "high-seas" | null;
}

// ─────────────────────────────────────────────────────────────────────
//  FINANCIAL / OPERATIONAL INTELLIGENCE OBJECTS
// ─────────────────────────────────────────────────────────────────────

/** Typed attributes for an Insurance Intelligence Object. */
export interface InsuranceAttributes {
  readonly vesselId: string | null;
  readonly insurer: string | null;
  readonly clubName: string | null; // P&I club name
  readonly policyNumber: string | null;
  readonly coverageType: "P&I" | "H&M" | "cargo" | "war" | null;
  readonly effectiveDate: string | null;
  readonly expiryDate: string | null;
  readonly insuredValue: number | null;
  readonly currency: string | null;
  readonly status: "active" | "expired" | "cancelled" | null;
}

/** Typed attributes for a Classification Society Intelligence Object. */
export interface ClassificationSocietyAttributes {
  readonly societyName: string | null; // "Lloyd's Register" | "DNV" | "BV" etc.
  readonly societyCode: string | null; // "LR" | "DNV" | "BV" etc.
  readonly vesselId: string | null;
  readonly classNotation: string | null;
  readonly surveyDate: string | null; // ISO 8601 date
  readonly nextSurveyDue: string | null; // ISO 8601 date
  readonly status: "classed" | "suspended" | "withdrawn" | null;
}

// ─────────────────────────────────────────────────────────────────────
//  DISCRIMINATED UNION — the Intelligence Object
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
//  TRADE PARTICIPANT INTELLIGENCE OBJECTS  (INT-01B extended)
// ─────────────────────────────────────────────────────────────────────

/** Typed attributes for a Terminal Intelligence Object. */
export interface TerminalAttributes {
  readonly name: string | null;
  readonly portId: string | null; // canonical port entity id
  readonly portUnlocode: string | null;
  readonly operatorId: string | null; // canonical company entity id
  readonly terminalType: "container" | "bulk" | "liquid" | "ro-ro" | "multipurpose" | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly totalQuayLength: number | null; // metres
  readonly maxVesselDraft: number | null; // metres
  readonly craneCount: number | null;
  readonly maxThroughput: number | null; // TEU/year
  readonly operationalStatus: "active" | "suspended" | "decommissioned" | null;
}

/** Typed attributes for a Bill of Lading Intelligence Object. */
export interface BillOfLadingAttributes {
  readonly bolNumber: string | null;
  readonly issuedDate: string | null; // ISO 8601 date
  readonly carrier: string | null;
  readonly carrierId: string | null; // canonical company entity id
  readonly shipperId: string | null; // canonical company/person entity id
  readonly consigneeId: string | null; // canonical company/person entity id
  readonly notifyPartyId: string | null;
  readonly portOfLoading: string | null;
  readonly portOfDischarge: string | null;
  readonly vesselId: string | null;
  readonly voyageId: string | null;
  readonly manifestId: string | null;
  readonly freightPayment: "prepaid" | "collect" | "as-arranged" | null;
  readonly bolType: "master" | "house" | "sea-waybill" | null;
  readonly status: "draft" | "issued" | "surrendered" | "expired" | null;
}

/** Typed attributes for an Importer Intelligence Object. */
export interface ImporterAttributes {
  readonly registeredName: string | null;
  readonly registrationNumber: string | null;
  readonly country: string | null;
  readonly address: string | null;
  readonly taxId: string | null;
  readonly importerCode: string | null; // country-specific importer code
  readonly riskCategory: "low" | "medium" | "high" | null;
  readonly cumulativeImports: number | null; // total declared import value
  readonly lastImportDate: string | null; // ISO 8601
}

/** Typed attributes for an Exporter Intelligence Object. */
export interface ExporterAttributes {
  readonly registeredName: string | null;
  readonly registrationNumber: string | null;
  readonly country: string | null;
  readonly address: string | null;
  readonly taxId: string | null;
  readonly exporterCode: string | null;
  readonly riskCategory: "low" | "medium" | "high" | null;
  readonly cumulativeExports: number | null;
  readonly lastExportDate: string | null; // ISO 8601
}

/** Typed attributes for a Consignee Intelligence Object. */
export interface ConsigneeAttributes {
  readonly registeredName: string | null;
  readonly registrationNumber: string | null;
  readonly country: string | null;
  readonly address: string | null;
  readonly consigneeCode: string | null;
  readonly isNotifyParty: boolean | null;
  readonly riskCategory: "low" | "medium" | "high" | null;
  readonly linkedImporterId: string | null; // canonical importer entity id
}

/**
 * A fully-typed Intelligence Object.
 * The discriminant is `objectKind` — every consumer can switch on it
 * and receive the narrowed, typed attribute set.
 *
 * attributes is typed per kind. Every field in attributes is optional
 * (null = evidence not yet available from any provider).
 */
export type IntelligenceObject =
  | (IntelligenceObjectBase & {
      readonly objectKind: "vessel";
      readonly attributes: VesselAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "voyage";
      readonly attributes: VoyageAttributes;
    })
  | (IntelligenceObjectBase & { readonly objectKind: "port"; readonly attributes: PortAttributes })
  | (IntelligenceObjectBase & {
      readonly objectKind: "cargo";
      readonly attributes: CargoAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "manifest";
      readonly attributes: ManifestAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "container";
      readonly attributes: ContainerAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "company";
      readonly attributes: CompanyAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "person";
      readonly attributes: PersonAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "director";
      readonly attributes: DirectorAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "owner";
      readonly attributes: OwnerAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "organisation";
      readonly attributes: OrganisationAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "sanction";
      readonly attributes: SanctionAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "inspection";
      readonly attributes: InspectionAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "incident";
      readonly attributes: IncidentAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "document";
      readonly attributes: DocumentAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "satellite-observation";
      readonly attributes: SatelliteObservationAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "weather-event";
      readonly attributes: WeatherEventAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "location";
      readonly attributes: LocationAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "insurance";
      readonly attributes: InsuranceAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "classification-society";
      readonly attributes: ClassificationSocietyAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "terminal";
      readonly attributes: TerminalAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "bill-of-lading";
      readonly attributes: BillOfLadingAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "importer";
      readonly attributes: ImporterAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "exporter";
      readonly attributes: ExporterAttributes;
    })
  | (IntelligenceObjectBase & {
      readonly objectKind: "consignee";
      readonly attributes: ConsigneeAttributes;
    });

/** Attribute map keyed by kind — for generic attribute access without a switch. */
export type AttributesForKind<K extends IntelligenceObjectKind> = Extract<
  IntelligenceObject,
  { objectKind: K }
>["attributes"];

/** All 20 Intelligence Object kinds as a runtime array. */
export const INTELLIGENCE_OBJECT_KINDS: ReadonlyArray<IntelligenceObjectKind> = [
  "vessel",
  "voyage",
  "port",
  "cargo",
  "manifest",
  "container",
  "company",
  "person",
  "director",
  "owner",
  "organisation",
  "sanction",
  "inspection",
  "incident",
  "document",
  "satellite-observation",
  "weather-event",
  "location",
  "insurance",
  "classification-society",
  "terminal",
  "bill-of-lading",
  "importer",
  "exporter",
  "consignee",
] as const;
