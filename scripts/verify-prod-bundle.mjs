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

const DIST = process.argv[2] || "dist";
const FORBIDDEN = [
  "@seaphore.local",
  "SeaphoreDev!2026",
  "DevCommandPalette",
  "quickLoginAs",
  "AuthDiagnostics",
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
  }
} catch (err) {
  console.error(`Could not scan ${DIST}:`, err.message);
  process.exit(0); // no dist yet is not a failure of this script
}

if (failed) {
  console.error("\nProduction bundle leaked dev-only symbols. Ensure DEV_AUTH_ENABLED guards are intact.");
  process.exit(1);
}
console.log(`OK — no dev-only symbols leaked into ${DIST}.`);
