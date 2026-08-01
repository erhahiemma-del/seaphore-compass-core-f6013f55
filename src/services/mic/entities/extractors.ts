/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01B — Intelligence Object Model · Attribute Extractors
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Pure functions that translate NormalizedEvidence fields into typed
 *  Intelligence Object attributes. One extractor per evidence kind,
 *  returning a partial attribute set (only the fields the evidence
 *  actually populates — never fabricating defaults).
 *
 *  Invariants:
 *    • Never throws — returns empty partial on any failure.
 *    • Never fabricates values — absent fields are null.
 *    • Deterministic — same input → same output.
 *    • No I/O, no async, no side effects.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import type {
  CargoAttributes,
  ClassificationSocietyAttributes,
  CompanyAttributes,
  ContainerAttributes,
  DocumentAttributes,
  IncidentAttributes,
  InspectionAttributes,
  InsuranceAttributes,
  LocationAttributes,
  ManifestAttributes,
  OrganisationAttributes,
  OwnerAttributes,
  PersonAttributes,
  PortAttributes,
  SanctionAttributes,
  SatelliteObservationAttributes,
  VesselAttributes,
  VoyageAttributes,
  WeatherEventAttributes,
} from "./types";

// ─── helpers ─────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

function strArray(v: unknown): ReadonlyArray<string> {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.includes(","))
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type F = Readonly<Record<string, unknown>>;
const f = (ev: NormalizedEvidence): F => ev.fields as F;

// ─────────────────────────────────────────────────────────────────────
//  VESSEL ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractVesselAttributes(ev: NormalizedEvidence): Partial<VesselAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<VesselAttributes>> = {};

  if (ev.kind === "identity" || ev.kind === "ownership") {
    const imo = str(fields.imo ?? fields.imoNumber);
    if (imo) out.imoNumber = imo;
    const mmsi = str(fields.mmsi ?? fields.ssvid);
    if (mmsi) out.mmsi = mmsi;
    const cs = str(fields.callSign ?? fields.callsign);
    if (cs) out.callSign = cs;
    const name = str(fields.name ?? fields.vesselName ?? fields.shipName);
    if (name) out.name = name;
    const fmr = strArray(fields.formerNames ?? fields.previousNames);
    if (fmr.length) out.formerNames = fmr;
    const flag = str(fields.flag ?? fields.flagCode);
    if (flag) out.flag = flag.toUpperCase();
    const flagState = str(fields.flagState ?? fields.flagCountry);
    if (flagState) out.flagState = flagState;
    const regPort = str(fields.registrationPort ?? fields.portOfRegistry);
    if (regPort) out.registrationPort = regPort;
    const regNum = str(fields.registrationNumber ?? fields.vesselRegistration);
    if (regNum) out.registrationNumber = regNum;
    const vType = str(fields.vesselType ?? fields.shipType ?? fields.type);
    if (vType) out.vesselType = vType;
    const vSub = str(fields.vesselSubtype ?? fields.subtype);
    if (vSub) out.vesselSubtype = vSub;
    const gt = num(fields.grossTonnage ?? fields.gt);
    if (gt !== null) out.grossTonnage = gt;
    const nt = num(fields.netTonnage ?? fields.nt);
    if (nt !== null) out.netTonnage = nt;
    const dwt = num(fields.deadweightTonnage ?? fields.dwt);
    if (dwt !== null) out.deadweightTonnage = dwt;
    const loa = num(fields.lengthOverall ?? fields.loa ?? fields.length);
    if (loa !== null) out.lengthOverall = loa;
    const breadth = num(fields.breadth ?? fields.beam);
    if (breadth !== null) out.breadth = breadth;
    const draft = num(fields.draft ?? fields.draught);
    if (draft !== null) out.draft = draft;
    const yr = num(fields.yearBuilt ?? fields.buildYear);
    if (yr !== null) out.yearBuilt = yr;
    const bc = str(fields.buildCountry ?? fields.countryOfBuild);
    if (bc) out.buildCountry = bc;
    const bn = str(fields.builderName ?? fields.builder ?? fields.shipyard);
    if (bn) out.builderName = bn;
    const cs2 = str(fields.classificationSociety ?? fields.classSociety);
    if (cs2) out.classificationSociety = cs2;
    const cn = str(fields.classNotation ?? fields.classStatus);
    if (cn) out.classNotation = cn;
    const status = str(fields.vesselStatus ?? fields.status);
    if (status) {
      const s = status.toLowerCase();
      out.status = ["active", "laid-up", "scrapped", "total-loss"].includes(s)
        ? (s as VesselAttributes["status"])
        : "unknown";
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  VOYAGE ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractVoyageAttributes(ev: NormalizedEvidence): Partial<VoyageAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<VoyageAttributes>> = {};
  if (ev.kind === "voyage" || ev.kind === "port-call" || ev.kind === "position") {
    const vn = str(fields.voyageNumber ?? fields.voyage);
    if (vn) out.voyageNumber = vn;
    const dp = str(fields.departurePort ?? fields.fromPort ?? fields.originPort);
    if (dp) out.departurePort = dp;
    const dpu = str(fields.departurePortUnlocode ?? fields.fromPortUnlocode);
    if (dpu) out.departurePortUnlocode = dpu;
    const dt = str(fields.departureTime ?? fields.atd);
    if (dt) out.departureTime = dt;
    const ap = str(
      fields.arrivalPort ??
        fields.toPort ??
        fields.destinationPort ??
        fields.portName ??
        fields.port,
    );
    if (ap) out.arrivalPort = ap;
    const apu = str(fields.arrivalPortUnlocode ?? fields.toPortUnlocode ?? fields.portUnlocode);
    if (apu) out.arrivalPortUnlocode = apu;
    const at = str(fields.arrivalTime ?? fields.ata);
    if (at) out.arrivalTime = at;
    const eta = str(fields.estimatedArrival ?? fields.eta);
    if (eta) out.estimatedArrival = eta;
    const vid = str(fields.vesselId ?? fields.vessel);
    if (vid) out.vesselId = vid;
    const cargo = str(fields.cargo ?? fields.cargoType ?? fields.commodity);
    if (cargo) out.cargo = cargo;
    const dr = num(fields.draught ?? fields.draft);
    if (dr !== null) out.draught = dr;
    const spd = num(fields.speed ?? fields.sog);
    if (spd !== null) out.speed = spd;
    const hdg = num(fields.heading ?? fields.cog);
    if (hdg !== null) out.heading = hdg;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  PORT ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractPortAttributes(ev: NormalizedEvidence): Partial<PortAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<PortAttributes>> = {};
  const unlocode = str(fields.unlocode ?? fields.portUnlocode ?? fields.locode);
  if (unlocode) out.unlocode = unlocode;
  const name = str(fields.portName ?? fields.name);
  if (name) out.name = name;
  const cc = str(fields.countryCode ?? fields.country);
  if (cc) out.countryCode = cc;
  const lat = num(fields.latitude ?? fields.lat);
  if (lat !== null) out.latitude = lat;
  const lon = num(fields.longitude ?? fields.lon);
  if (lon !== null) out.longitude = lon;
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  CARGO ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractCargoAttributes(ev: NormalizedEvidence): Partial<CargoAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<CargoAttributes>> = {};
  if (ev.kind === "cargo") {
    const desc = str(fields.description ?? fields.commodity ?? fields.cargoDescription);
    if (desc) out.description = desc;
    const hs = str(fields.hsCode ?? fields.hs);
    if (hs) out.hsCode = hs;
    const hsd = str(fields.hsDescription);
    if (hsd) out.hsDescription = hsd;
    const qty = num(fields.quantity ?? fields.quantity_value);
    if (qty !== null) out.quantity = qty;
    const unit = str(fields.quantityUnit ?? fields.unit);
    if (unit) out.quantityUnit = unit;
    const wt = num(fields.weight ?? fields.grossWeight);
    if (wt !== null) out.weight = wt;
    const val = num(fields.value ?? fields.dutiableValue);
    if (val !== null) out.value = val;
    const cur = str(fields.currency);
    if (cur) out.currency = cur;
    const dg = bool(fields.dangerousGoods ?? fields.isDangerous ?? fields.hazardous);
    if (dg !== null) out.dangerousGoods = dg;
    const imdg = str(fields.imdgClass ?? fields.imcoClass);
    if (imdg) out.imdgClass = imdg;
    const orig = str(fields.originCountry ?? fields.countryOfOrigin);
    if (orig) out.originCountry = orig;
    const dest = str(fields.destinationCountry);
    if (dest) out.destinationCountry = dest;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  COMPANY ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractCompanyAttributes(ev: NormalizedEvidence): Partial<CompanyAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<CompanyAttributes>> = {};
  const name = str(fields.companyName ?? fields.name ?? fields.registeredName);
  if (name) out.registeredName = name;
  const trade = str(fields.tradingName ?? fields.tradeName);
  if (trade) out.tradingName = trade;
  const regNum = str(fields.registrationNumber ?? fields.companyNumber);
  if (regNum) out.registrationNumber = regNum;
  const country = str(fields.registrationCountry ?? fields.country ?? fields.jurisdiction);
  if (country) out.registrationCountry = country;
  const cac = str(fields.cacNumber ?? fields.cac);
  if (cac) out.cacNumber = cac;
  const lei = str(fields.leiCode ?? fields.lei);
  if (lei) out.leiCode = lei;
  const status = str(fields.status ?? fields.companyStatus);
  if (status) {
    const s = status.toLowerCase();
    out.status = ["active", "dissolved", "dormant"].includes(s)
      ? (s as CompanyAttributes["status"])
      : "unknown";
  }
  const address = str(fields.address ?? fields.registeredAddress);
  if (address) out.address = address;
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  PERSON ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractPersonAttributes(ev: NormalizedEvidence): Partial<PersonAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<PersonAttributes>> = {};
  const name = str(fields.fullName ?? fields.name ?? fields.personName);
  if (name) out.fullName = name;
  const fmr = strArray(fields.formerNames ?? fields.aliases ?? fields.previousNames);
  if (fmr.length) out.formerNames = fmr;
  const nat = str(fields.nationality ?? fields.citizenOf);
  if (nat) out.nationality = nat;
  const dob = str(fields.dateOfBirth ?? fields.birthDate ?? fields.dob);
  if (dob) out.dateOfBirth = dob;
  const pob = str(fields.placeOfBirth ?? fields.birthPlace);
  if (pob) out.placeOfBirth = pob;
  const pass = str(fields.passportNumber ?? fields.passport);
  if (pass) out.passportNumber = pass;
  const sfr = str(fields.seafarerBookNumber ?? fields.cdcNumber ?? fields.seamanBook);
  if (sfr) out.seafarerBookNumber = sfr;
  const rank = str(fields.rank ?? fields.position ?? fields.role);
  if (rank) out.rank = rank;
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  SANCTION ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractSanctionAttributes(ev: NormalizedEvidence): Partial<SanctionAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<SanctionAttributes>> = {};
  if (ev.kind === "sanctions") {
    const list = str(fields.sanctionList ?? fields.listName ?? fields.source);
    if (list) out.sanctionListName = list;
    const lid = str(fields.sanctionId ?? fields.listId ?? fields.entryId);
    if (lid) out.sanctionListId = lid;
    const prog = str(fields.programmeName ?? fields.program ?? fields.regime);
    if (prog) out.programmeName = prog;
    const eff = str(fields.effectiveDate ?? fields.listingDate);
    if (eff) out.effectiveDate = eff;
    const exp = str(fields.expiryDate ?? fields.removalDate);
    if (exp) out.expiryDate = exp;
    const reason = str(fields.reason ?? fields.grounds ?? fields.basis);
    if (reason) out.reason = reason;
    const status = str(fields.status ?? fields.sanctionStatus);
    if (status) {
      const s = status.toLowerCase();
      out.status = ["active", "expired", "delisted"].includes(s)
        ? (s as SanctionAttributes["status"])
        : "active";
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  INSPECTION ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────

export function extractInspectionAttributes(ev: NormalizedEvidence): Partial<InspectionAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<InspectionAttributes>> = {};
  if (ev.kind === "inspection") {
    const type = str(fields.inspectionType ?? fields.type);
    if (type)
      out.inspectionType = (
        ["PSC", "flag", "class", "internal", "ISM"].includes(type as string) ? type : null
      ) as InspectionAttributes["inspectionType"];
    const auth = str(fields.authority ?? fields.pscAuthority);
    if (auth) out.authority = auth;
    const date = str(fields.inspectionDate ?? fields.date);
    if (date) out.inspectionDate = date;
    const result = str(fields.result ?? fields.outcome);
    if (result) {
      const r = result.toLowerCase();
      out.result = (
        ["passed", "deficiencies", "detained", "failed"].includes(r) ? r : null
      ) as InspectionAttributes["result"];
    }
    const def = num(fields.deficiencies ?? fields.deficiencyCount);
    if (def !== null) out.deficiencies = def;
    const det = num(fields.detentionDays);
    if (det !== null) out.detentionDays = det;
    const notes = str(fields.notes ?? fields.remarks);
    if (notes) out.notes = notes;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  SATELLITE OBSERVATION ATTRIBUTES  (Copernicus CDSE)
// ─────────────────────────────────────────────────────────────────────

export function extractSatelliteObservationAttributes(
  ev: NormalizedEvidence,
): Partial<SatelliteObservationAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<SatelliteObservationAttributes>> = {};
  if (ev.kind === "other") {
    const sid = str(fields.sceneId);
    if (sid) out.sceneId = sid;
    const col = str(fields.collection);
    if (col) out.collection = col;
    const plat = str(fields.platform);
    if (plat) out.platform = plat;
    const acq = str(fields.acquisitionTime);
    if (acq) out.acquisitionTime = acq;
    const clat = num(fields.centroidLatitude);
    if (clat !== null) out.centroidLatitude = clat;
    const clon = num(fields.centroidLongitude);
    if (clon !== null) out.centroidLongitude = clon;
    const bw = num(fields.bboxWest);
    if (bw !== null) out.bboxWest = bw;
    const bs = num(fields.bboxSouth);
    if (bs !== null) out.bboxSouth = bs;
    const be = num(fields.bboxEast);
    if (be !== null) out.bboxEast = be;
    const bn = num(fields.bboxNorth);
    if (bn !== null) out.bboxNorth = bn;
    const cc = num(fields.cloudCover);
    if (cc !== null) out.cloudCover = cc;
    const mode = str(fields.sarMode);
    if (mode) out.sarMode = mode;
    const pol = str(fields.sarPolarisation);
    if (pol) out.sarPolarisation = pol;
    const gsd = num(fields.groundSamplingDistance);
    if (gsd !== null) out.groundSamplingDistance = gsd;
    const lic = str(fields.license);
    if (lic) out.license = lic;
    const thumb = str(fields.thumbnailHref);
    if (thumb) out.thumbnailHref = thumb;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  WEATHER EVENT ATTRIBUTES  (Environmental Intelligence Provider)
// ─────────────────────────────────────────────────────────────────────

export function extractWeatherEventAttributes(
  ev: NormalizedEvidence,
): Partial<WeatherEventAttributes> {
  const fields = f(ev);
  const out: Mutable<Partial<WeatherEventAttributes>> = {};
  if (ev.kind === "weather") {
    const time = str(fields.observationTime ?? ev.observedAt);
    if (time) out.observationTime = time;
    const lat = num(fields.latitude ?? fields.lat);
    if (lat !== null) out.latitude = lat;
    const lon = num(fields.longitude ?? fields.lon);
    if (lon !== null) out.longitude = lon;
    const wh = num(fields.waveHeight ?? fields.significantWaveHeight);
    if (wh !== null) out.waveHeight = wh;
    const ws = num(fields.windSpeed ?? fields.wind_speed_10m ?? fields.windSpeedKnots);
    if (ws !== null) out.windSpeed = ws;
    const wd = num(fields.windDirection ?? fields.wind_direction_10m);
    if (wd !== null) out.windDirection = wd;
    const sst = num(fields.seaSurfaceTemp ?? fields.sst ?? fields.sea_surface_temperature);
    if (sst !== null) out.seaSurfaceTemp = sst;
    const sh = num(fields.swellHeight ?? fields.swellWaveHeight);
    if (sh !== null) out.swellHeight = sh;
    const sp = num(fields.swellPeriod ?? fields.swellWavePeriod);
    if (sp !== null) out.swellPeriod = sp;
    const vis = num(fields.visibility);
    if (vis !== null) out.visibility = vis;
    const model = str(fields.sourceModel ?? fields.model ?? ev.sourceName);
    if (model) out.sourceModel = model;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  DISPATCH TABLE — evidence kind → extractor
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract typed attributes from a NormalizedEvidence record.
 * Returns a Partial for the most relevant attribute type, or null
 * when the evidence kind has no extractor for this entity kind.
 */
export function extractAttributes(
  ev: NormalizedEvidence,
  entityKind: string,
): Partial<
  | VesselAttributes
  | CompanyAttributes
  | PersonAttributes
  | CargoAttributes
  | SanctionAttributes
  | InspectionAttributes
  | SatelliteObservationAttributes
  | WeatherEventAttributes
  | VoyageAttributes
  | PortAttributes
> | null {
  switch (entityKind) {
    case "vessel":
      return extractVesselAttributes(ev);
    case "voyage":
      return extractVoyageAttributes(ev);
    case "port":
      return extractPortAttributes(ev);
    case "cargo":
      return extractCargoAttributes(ev);
    case "company":
      return extractCompanyAttributes(ev);
    case "person":
      return extractPersonAttributes(ev);
    case "sanction":
      return extractSanctionAttributes(ev);
    case "inspection":
      return extractInspectionAttributes(ev);
    case "satellite-observation":
      return extractSatelliteObservationAttributes(ev);
    case "weather-event":
      return extractWeatherEventAttributes(ev);
    default:
      return null;
  }
}
