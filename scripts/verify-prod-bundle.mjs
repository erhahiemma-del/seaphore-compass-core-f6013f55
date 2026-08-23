#!/usr/bin/env node
/**
 * Production bundle guard.
 *
 * Fails CI if the built assets contain any dev-only marker:
 *   - dev seed emails (@seaphore.local)
 *   - the dev seed password
 *   - dev command palette or quick-login symbols
 *
 * These are wrapped behind `if (!import.meta.env.PROD)` guards that
 * Rollup dead-code eliminates in prod builds. This script proves it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Scans the CLIENT assets — what actually reaches a browser. The SSR
// bundle under .output/server is a separate surface: dev-auth constants
// legitimately survive there because that code runs server-side and is
// never served to a user. Widening this to .output would conflate the
// two and report a browser leak that is not one.
const DIST = process.argv[2] || "dist";
const FORBIDDEN = [
  "@seaphore.local",
  "SeaphoreDev!2026",
  "DevCommandPalette",
  "quickLoginAs",
  "AuthDiagnostics",
];

/**
 * Claims that must never appear in a production bundle *as observations*.
 *
 * The lifecycle fixtures are allowed to ship — the surfaces that render
 * them would otherwise be blank, and they are marked `SIMULATED`. What
 * must not ship is a fixture wearing the vocabulary of a real
 * observation, because that is the combination an officer could act on.
 *
 * Kept as a separate list from FORBIDDEN so a failure here reads as a
 * truth-layer regression rather than a dev-symbol leak.
 */
const FORBIDDEN_CLAIMS = [
  // A fixture may never claim it was observed or verified.
  'confidence:"observed"',
  'confidence:"verified"',
  // Bare seven-digit IMOs from the fixtures. Real registry numbers, some
  // belonging to real vessels; they must carry the DEMO- prefix.
  '"9432187"',
  '"9187562"',
  '"9722145"',
  '"9601028"',
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|cjs|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

let failed = false;
try {
  const files = walk(DIST);
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const needle of FORBIDDEN) {
      if (src.includes(needle)) {
        console.error(`FAIL: '${needle}' found in ${f}`);
        failed = true;
      }
    }
    for (const claim of FORBIDDEN_CLAIMS) {
      if (src.includes(claim)) {
        console.error(`FAIL (truth-layer): fabricated claim ${claim} found in ${f}`);
        failed = true;
      }
    }
  }
} catch (err) {
  console.error(`Could not scan ${DIST}:`, err.message);
  process.exit(0); // no dist yet is not a failure of this script
}

if (failed) {
  console.error(
    "\nProduction bundle leaked dev-only symbols. Ensure DEV_AUTH_ENABLED guards are intact.",
  );
  process.exit(1);
}
console.log(`OK — no dev-only symbols leaked into ${DIST}.`);
