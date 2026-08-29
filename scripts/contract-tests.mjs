/**
 * Run the architectural guard tests.
 *
 * ## Why this script exists rather than a list in package.json
 *
 * `vitest related` picks tests by walking the module graph: change a
 * file, and it runs the tests that import it. That covers most of the
 * suite, and it is what the pre-commit hook uses.
 *
 * It cannot see a whole class of test in this repository. The guard
 * tests — the composition contract, the token and navigation contracts,
 * the client-secret check — deliberately read source with `readFileSync`
 * instead of importing it, because what they assert is a property of the
 * text (no fabricated figure, no second KPI system, no secret reaching
 * the browser) rather than of a value. Nothing imports them into a
 * graph, so:
 *
 *     vitest related --run src/features/mission-control/MissionControl.tsx
 *     → No test files found, exiting with code 0
 *
 * That green is the most dangerous output in the pipeline. Someone could
 * delete a `data-testid`, inline a hard-coded vessel count or flatten
 * progressive disclosure, and the hook would agree the change was safe.
 * So these run on every commit regardless of what was touched.
 *
 * ## Why discovered rather than enumerated
 *
 * A hard-coded list of twelve paths is correct exactly once. The next
 * guard test gets written, nobody thinks to register it, and it silently
 * never runs pre-commit again — the failure mode being a guard everyone
 * believes is protecting them.
 *
 * Reading source is the property that makes a test invisible to the
 * module graph, so it is also the right way to select them. The
 * selection is printed on every run: this should never be a black box.
 */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), "tests/unit");

/**
 * A test the module graph cannot reach, and so must always be run.
 *
 * Detected by how it reads source, which is the property that makes it
 * invisible to `vitest related` in the first place. Reading through the
 * shared walker in `helpers/source-tree` counts: when two guards were
 * refactored onto it they stopped containing the literal `readFileSync`,
 * silently dropped out of this run — 48 became 46 — and the suite still
 * reported green. That is precisely the "guard everyone believes is
 * protecting them" this script exists to prevent, so the selector tracks
 * the behaviour rather than one spelling of it.
 */
const READS_SOURCE = /readFileSync|readdirSync|helpers\/source-tree/;
const isGuard = (file) => READS_SOURCE.test(readFileSync(resolve(DIR, file), "utf8"));

const guards = readdirSync(DIR)
  .filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))
  .filter(isGuard)
  .map((f) => `tests/unit/${f}`)
  .sort();

/*
 * A floor, not just a zero-check.
 *
 * Zero was already refused, but the dangerous case is subtler: a handful
 * quietly falling out of selection while the rest still run and the suite
 * still passes. The number only goes up in practice, so a drop below what
 * is known to exist means the selector broke, not that guards were
 * deliberately deleted.
 */
const MINIMUM_GUARDS = 48;

if (guards.length < MINIMUM_GUARDS) {
  console.error(
    `✖ Found ${guards.length} guard tests in tests/unit, expected at least ${MINIMUM_GUARDS}.`,
  );
  console.error("  Guards are selected by how they read source. If one was refactored onto a");
  console.error("  different helper, extend the selector — do not lower this floor to match.");
  process.exit(1);
}

console.log(`Running ${guards.length} architectural guard tests:`);
for (const g of guards) console.log(`  ${g}`);

const vitest = resolve(process.cwd(), "node_modules/.bin/vitest");
const result = spawnSync(vitest, ["run", ...guards], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
