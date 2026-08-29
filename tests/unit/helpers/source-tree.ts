/**
 * Walking the source tree without racing whatever else is writing to it.
 *
 * ## The failure this removes
 *
 * Several guards scan the repository — for control bytes, for credential
 * reads, for theme writers. They walked with `readdirSync` and then called
 * `statSync` on each entry, which is two syscalls with a gap between them.
 * Anything writing to the tree during that gap — a dev server emitting a
 * chunk, a formatter rewriting a file, an editor saving — could remove or
 * replace an entry after the listing and before the stat, and `statSync`
 * throws `ENOENT`.
 *
 * The result was a guard failing with a filesystem error rather than a
 * finding, intermittently, on a different file each time. That is worse
 * than a flaky test: a security guard that fails for unrelated reasons
 * teaches everyone to re-run it until it passes, which is exactly the
 * habit that lets a real failure through.
 *
 * ## What this does not do
 *
 * It does not relax a single assertion. Directory-ness now comes from the
 * same `readdir` call that listed the entry, so there is no second syscall
 * to race; a file that genuinely vanishes mid-walk is skipped rather than
 * throwing. Skipping is safe here only because {@link readSource} is paired
 * with a count assertion at every call site — a walk that quietly found
 * nothing would otherwise satisfy every "no leaks" check while checking
 * nothing at all.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Directories never worth scanning.
 *
 * Build output and caches are generated, are rewritten constantly, and
 * contain no source anybody authored — so they are both the likeliest
 * cause of a race and the least useful thing to inspect.
 */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".output",
  ".vite",
  ".nitro",
  ".wrangler",
  ".tanstack",
]);

function ignored(name: string): boolean {
  // Dot-directories are tooling state by convention, not source.
  return IGNORED_DIRECTORIES.has(name) || name.startsWith(".");
}

/**
 * Every file under `dir` matching `extensions`.
 *
 * Entries that disappear between the listing and the recursion are
 * skipped: a directory that no longer exists cannot contain a leak.
 */
export function sourceFilesUnder(dir: string, extensions: RegExp): string[] {
  const out: string[] = [];

  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // The directory went away, or was never there. Nothing to scan.
    return out;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignored(entry.name)) continue;
      out.push(...sourceFilesUnder(path, extensions));
      continue;
    }
    if (entry.isFile() && extensions.test(entry.name)) out.push(path);
  }

  return out;
}

/**
 * Read a file, or `null` if it vanished since the walk listed it.
 *
 * Null means "gone", never "empty" — a caller that treats the two the same
 * would report a cleanly passing scan of a file it never read. Every call
 * site must therefore assert on the number of files it actually read.
 */
export function readSource(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Read a file as raw bytes, or `null` if it vanished since the walk.
 *
 * Separate from {@link readSource} because decoding to a string and
 * re-encoding is lossy: an invalid UTF-8 sequence becomes U+FFFD and the
 * original bytes are gone. A guard looking for stray control bytes has to
 * see what is actually on disk, so it gets the buffer.
 */
export function readSourceBytes(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}
