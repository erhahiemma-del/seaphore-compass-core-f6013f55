/**
 * Generate the committed NPA operational dataset from a workbook.
 *
 * Usage:
 *   node scripts/ingest-npa-workbook.mjs "<path to .xlsx>"
 *
 * ## Why this bundles the TypeScript rather than reimplementing it
 *
 * The parsing rules live in `workbook-normalisation.ts` and the record
 * shapes in `workbook-ingest.ts`, and both are covered by tests. A script
 * that re-read the spreadsheet its own way would be a second normaliser
 * that drifts from the first, and the drift would show up as records that
 * disagree with the tests that supposedly cover them. So this compiles
 * the real modules with esbuild and calls them.
 *
 * ## Why the output is committed
 *
 * The workbook is a file on one person's machine. Committing the derived
 * dataset is what lets the map show NPA vessels on a fresh checkout, in
 * CI, and in a browser with no session — which is the whole point, since
 * the operational picture must not depend on being signed in.
 *
 * Re-running against the same workbook rewrites the file byte for byte:
 * ids are hashes of (file, sheet, row), so a re-ingest replaces rather
 * than accumulates. `git diff` after a no-change run is empty, and that
 * is the idempotence check.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import esbuild from "esbuild";
import XLSX from "xlsx";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/services/government/npa/data/npa-operational-dataset.json");

const workbookPath = process.argv[2];
if (!workbookPath) {
  console.error("Usage: node scripts/ingest-npa-workbook.mjs <path to .xlsx>");
  process.exit(1);
}

/* Compile the real ingest module, aliasing the `@/` paths it imports. */
const bundlePath = resolve(tmpdir(), `npa-ingest-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/services/government/npa/workbook-ingest.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "warning",
  alias: { "@": resolve(ROOT, "src") },
});

const { ingestWorkbook } = await import(pathToFileURL(bundlePath).href);

const workbook = XLSX.read(readFileSync(workbookPath), { type: "buffer" });
const sheets = workbook.SheetNames.map((name) => ({
  name,
  rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: false }),
}));

const dataset = ingestWorkbook(sheets, {
  /*
   * The file's name, not its path. The path is one machine's directory
   * layout and would put a home directory into a committed artefact;
   * the name is what identifies which NPA publication this came from.
   */
  sourceFile: basename(workbookPath),
  /*
   * Fixed to the workbook's own modification time rather than "now", so
   * re-running the script does not rewrite every record's timestamp and
   * produce a diff that says nothing changed except when it ran.
   */
  ingestedAt: statSync(workbookPath).mtime.toISOString(),
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

const { summary } = dataset;
console.log(`Wrote ${OUT}`);
console.table({
  sheets: summary.sheets,
  "data rows": summary.dataRows,
  "port calls": summary.portCalls,
  vessels: summary.vessels,
  berths: summary.berths,
  "vacant berths": summary.vacantBerths,
  terminals: summary.terminals,
  ports: summary.ports,
  rejected: summary.rejected,
});
console.table(summary.byStatus);

if (summary.rejected > 0) {
  console.log(`\n${summary.rejected} row(s) not ingested:`);
  for (const rejection of dataset.rejections.slice(0, 20)) {
    console.log(`  ${rejection.source.sheet}:${rejection.source.row} — ${rejection.reason}`);
  }
}
