/**
 * Build the port gazetteer asset from the UN/LOCODE code list.
 *
 * Run:  node scripts/build-port-gazetteer.mjs <path-to-code-list.csv>
 * Out:  public/gazetteer/un-locode-ports.json
 *
 * ## Source and licence
 *
 * UN/LOCODE — United Nations Code for Trade and Transport Locations,
 * maintained by UNECE. Obtained from https://github.com/datasets/un-locode
 * (`data/code-list.csv`), which mirrors the UNECE publication.
 *
 * Licence: **ODC Public Domain Dedication and Licence (PDDL)**. No
 * attribution requirement, no share-alike, no field-of-use restriction —
 * chosen precisely so the gazetteer creates no production obligation.
 *
 * Deliberately *not* used: `cristan/improved-un-locodes`, which has far
 * better coordinate coverage (98.7%) but merges OpenStreetMap Nominatim
 * data under ODbL 1.0. ODbL is share-alike, and inheriting it here would
 * be exactly the unexamined production restriction this sprint was told
 * to avoid.
 *
 * ## What is kept
 *
 * Only entries whose UN/LOCODE `Function` mask begins with `1`, meaning
 * the location is a seaport. Entries **without** coordinates are kept
 * too, with null position: "this port exists and we do not know where"
 * is a different fact from "no such port code", and collapsing them
 * would make an unresolved endpoint indistinguishable from a typo.
 *
 * ## Coordinate precision
 *
 * UN/LOCODE publishes degree-and-minute coordinates (`4230N 00131E`),
 * so one minute is the resolution — roughly 1.85 km, i.e. about ±0.9 km
 * after rounding. That is fine for placing a voyage endpoint on a world
 * map and is nowhere near berth accuracy. The figure is carried in the
 * asset's metadata and surfaced in the UI rather than left implicit.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE_URL = "https://github.com/datasets/un-locode";
const LICENCE = "ODC Public Domain Dedication and Licence (PDDL)";
const OUT = resolve(process.cwd(), "public/gazetteer/un-locode-ports.json");

/** Minimal RFC4180-ish parser — location names contain commas and quotes. */
function parseLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Decode `4230N 00131E` into decimal degrees.
 *
 * Returns null rather than a guess for anything malformed — a bad
 * coordinate must become "unresolved", never a plausible-looking point.
 */
function decodeCoordinates(raw) {
  const match = /^\s*(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})([EW])\s*$/.exec(raw ?? "");
  if (!match) return null;
  const [, latDeg, latMin, ns, lonDeg, lonMin, ew] = match;
  const lat = (Number(latDeg) + Number(latMin) / 60) * (ns === "S" ? -1 : 1);
  const lon = (Number(lonDeg) + Number(lonMin) / 60) * (ew === "W" ? -1 : 1);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [Number(lon.toFixed(4)), Number(lat.toFixed(4))];
}

/**
 * `YYMM` to a sortable YYYYMM.
 *
 * UN/LOCODE has entries stamped from the 1990s onward, so a two-digit
 * year needs a century. 50–99 is last century; 00–49 is this one, which
 * holds until 2050 and is the convention the code list itself uses.
 */
function toAbsoluteYearMonth(stamp) {
  const yy = Number(stamp.slice(0, 2));
  const mm = stamp.slice(2, 4);
  return Number(`${yy >= 50 ? 1900 + yy : 2000 + yy}${mm}`);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: node scripts/build-port-gazetteer.mjs <code-list.csv>");
  process.exit(1);
}

const csvRaw = readFileSync(csvPath);
const sourceSha256 = createHash("sha256").update(csvRaw).digest("hex");
const sourceHash = sourceSha256;
const sourceSize = csvRaw.byteLength;

const lines = csvRaw.toString("utf8").split(/\r?\n/);
const header = parseLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const ports = {};
let seaports = 0;
let located = 0;
/** Newest `YYMM` seen in the source's per-entry Date column. */
let sourceVersion = null;

for (let i = 1; i < lines.length; i += 1) {
  if (!lines[i]) continue;
  const row = parseLine(lines[i]);

  /*
   * Track the newest release stamp across the whole file, not just the
   * seaports, so the version reflects the source rather than the slice.
   *
   * The column is `YYMM` with a two-digit year, so it must be compared
   * numerically with a century inferred — sorting the strings ranks
   * "9912" (December 1999) above "2603" (March 2026), which is how the
   * first run of this script reported a 1999 dataset.
   */
  const stamp = (row[col.Date] ?? "").trim();
  if (/^\d{4}$/.test(stamp)) {
    const absolute = toAbsoluteYearMonth(stamp);
    if (sourceVersion === null || absolute > toAbsoluteYearMonth(sourceVersion)) {
      sourceVersion = stamp;
    }
  }

  const fn = row[col.Function] ?? "";
  // Function mask position 1 === "1" means seaport.
  if (fn[0] !== "1") continue;

  const country = (row[col.Country] ?? "").trim();
  const location = (row[col.Location] ?? "").trim();
  if (country.length !== 2 || location.length !== 3) continue;

  seaports += 1;
  const position = decodeCoordinates(row[col.Coordinates]);
  if (position) located += 1;

  ports[`${country}${location}`] = {
    n: (row[col.NameWoDiacritics] || row[col.Name] || "").trim(),
    c: country,
    ...(position ? { p: position } : {}),
  };
}

const asset = {
  metadata: {
    name: "UN/LOCODE seaports",
    source: SOURCE_URL,
    sourceOrganisation: "UNECE — United Nations Economic Commission for Europe",
    licence: LICENCE,
    licenceUrl: "https://opendatacommons.org/licenses/pddl/1-0/",
    identifier: "UN/LOCODE (2-letter country + 3-letter location)",
    /** Newest `Date` field in the source, as `YYMM`. The release this came from. */
    sourceVersion,
    /** SHA-256 of the CSV this was built from, so the input is identifiable. */
    sourceSha256: sourceHash,
    sourceBytes: sourceSize,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/build-port-gazetteer.mjs",
    /** Rows whose Function mask marks them a seaport. */
    seaportCount: seaports,
    /** Distinct identifiers retained; duplicates in the source collapse. */
    recordCount: Object.keys(ports).length,
    /** Of `recordCount`, how many carry a position. */
    locatedCount: located,
    coordinatePrecision: "degree-and-minute (~1.85 km per minute; about +/-0.9 km)",
    notice:
      "Positions are UN/LOCODE degree-and-minute centroids for the location, not surveyed berth or harbour-entrance positions. Entries without a position are retained with none: a port whose location is unpublished is not the same as an unknown port code.",
  },
  ports,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(asset));

// A sidecar the repository can read without parsing 850 KB of ports.
writeFileSync(resolve(dirname(OUT), "PROVENANCE.json"), JSON.stringify(asset.metadata, null, 2));

const records = Object.keys(ports).length;
console.log(`source version : ${sourceVersion ?? "unknown"}  sha256 ${sourceSha256.slice(0, 16)}…`);
console.log(`seaport rows   : ${seaports}`);
console.log(`unique records : ${records}`);
console.log(`with position  : ${located} (${((100 * located) / records).toFixed(1)}%)`);
console.log(`written: ${OUT}`);
