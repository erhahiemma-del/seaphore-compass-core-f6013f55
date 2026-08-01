/**
 * Security regression: client-reachable source must contain zero
 * references to authenticated-connector secret names or VITE_
 * aliases. Fails the build if any leak is introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const FORBIDDEN = ["GLOBAL_FISHING_WATCH_API_KEY", "VITE_GLOBAL_FISHING_WATCH"];

// Any *.server.ts, *.server.tsx, or *.functions.ts file is server-only.
function isServerOnly(path: string): boolean {
  return /\.server\.(t|j)sx?$/.test(path) || /\.functions\.(t|j)sx?$/.test(path);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("Security · authenticated-connector secrets never reach the client bundle", () => {
  it("no client-reachable source references forbidden secret identifiers", () => {
    const files = walk(ROOT).filter((f) => !isServerOnly(f));
    const leaks: Array<{ file: string; token: string; line: string }> = [];
    for (const file of files) {
      // Test files themselves are allowed to reference the identifiers.
      if (/\.test\.(ts|tsx|js|jsx)$/.test(file)) continue;
      const contents = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        if (contents.includes(token)) {
          const line =
            contents
              .split("\n")
              .find((l) => l.includes(token))
              ?.trim() ?? "";
          leaks.push({ file, token, line });
        }
      }
    }
    expect(leaks, `Client-reachable leaks detected:\n${JSON.stringify(leaks, null, 2)}`).toEqual(
      [],
    );
  });
});
