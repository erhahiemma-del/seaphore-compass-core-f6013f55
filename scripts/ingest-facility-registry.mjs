/**
 * Generate the committed facility registry from the Seaphore Registry
 * workbook.
 *
 * Usage:
 *   node scripts/ingest-facility-registry.mjs "<path to .xlsx>"
 *
 * Same shape as the NPA ingest script next door and for the same reasons:
 * the parsing rules live in TypeScript that is covered by tests, esbuild
 * compiles the real module rather than a second implementation of it, and
 * the derived dataset is committed so the map works on a fresh checkout
 * with no session and no credentials.
 *
 * The audit prints before the counts, because the question that matters
 * first is whether any sheet went unrecognised.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import esbuild from "esbuild";
import XLSX from "xlsx";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/services/registry/data/facility-registry.json");

const workbookPath = process.argv[2];
if (!workbookPath) {
  console.error("Usage: node scripts/ingest-facility-registry.mjs <path to .xlsx>");
  process.exit(1);
}

const bundlePath = resolve(tmpdir(), `registry-ingest-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/services/registry/registry-ingest.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "warning",
  alias: { "@": resolve(ROOT, "src") },
});

const { ingestRegistry } = await import(pathToFileURL(bundlePath).href);

const bytes = readFileSync(workbookPath);
const sourceFileHash = createHash("sha256").update(bytes).digest("hex");
const workbook = XLSX.read(bytes, { type: "buffer" });

/*
 * Read by header rather than by position. The registry's sheets have
 * genuinely different shapes, and a positional reader would put a
 * latitude into an operator field on the sheets whose columns differ.
 */
const sheets = workbook.SheetNames.map((name) => ({
  name,
  rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null, raw: false }),
}));

const registry = ingestRegistry(sheets, {
  sourceFile: basename(workbookPath),
  sourceFileHash,
  ingestedAt: statSync(workbookPath).mtime.toISOString(),
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

console.log(`REGISTRY AUDIT — ${basename(workbookPath)}`);
console.log(`sha256 ${sourceFileHash}`);
console.table(
  registry.audit.map((sheet) => ({
    sheet: sheet.sheet,
    kind: sheet.kind,
    rows: sheet.rows,
    accepted: sheet.accepted,
    skipped: sheet.skipped,
    drawable: sheet.withFacilityGeometry,
    "port-anchored": sheet.portAnchored,
    "no geometry": sheet.noGeometry,
    note: sheet.note ? sheet.note.slice(0, 40) : "",
  })),
);

const unknown = registry.audit.filter((sheet) => sheet.kind === "UNKNOWN");
if (unknown.length > 0) {
  console.log("\nUNKNOWN — REQUIRES REVIEW:");
  for (const sheet of unknown) console.log(`  ${sheet.sheet}`);
}

console.log(`\nWrote ${OUT}`);
console.log(`import run ${registry.importRunId}`);
console.table({
  ports: registry.ports.length,
  terminals: registry.terminals.length,
  "jetties & facilities": registry.facilities.length,
  offshore: registry.offshore.length,
  "LNG & gas": registry.lngGas.length,
  companies: registry.companies.length,
  concessions: registry.concessions.length,
});

/*
 * The number that decides whether the map gains a terminal layer: how
 * many facilities the registry locates well enough to draw in their own
 * right, as opposed to at their parent port's coordinate.
 */
const all = [
  ...registry.ports,
  ...registry.terminals,
  ...registry.facilities,
  ...registry.offshore,
  ...registry.lngGas,
];
const by = (state) => all.filter((entry) => entry.point.geometry === state).length;
console.table({
  "facility-level geometry": by("VERIFIED_GEOMETRY"),
  "port-anchored (not drawable as facility)": by("PORT_ANCHORED"),
  "no geometry": by("GEOMETRY_PENDING"),
});
