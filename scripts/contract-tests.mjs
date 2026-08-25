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

/** A test the module graph cannot reach, and so must always be run. */
const isGuard = (file) =>
  /\breadFileSync\b|\breaddirSync\b/.test(readFileSync(resolve(DIR, file), "utf8"));

const guards = readdirSync(DIR)
  .filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))
  .filter(isGuard)
  .map((f) => `tests/unit/${f}`)
  .sort();

if (guards.length === 0) {
  // Every one of them disappearing at once is far more likely to be a
  // broken selector than a deliberate deletion, and reporting success
  // would be the exact failure this script is written to avoid.
  console.error(
    "✖ No guard tests found in tests/unit. Expected several. Refusing to report success.",
  );
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
