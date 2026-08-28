/**
 * Security regression: the OpenSanctions credential must never be
 * reachable from browser code, a VITE_ alias, or client persistence.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function isServerOnly(path: string): boolean {
  return /\.server\.(t|j)sx?$/.test(path) || /\.functions\.(t|j)sx?$/.test(path);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("Security · OpenSanctions credential never reaches the browser", () => {
  const clientFiles = walk(ROOT).filter((f) => !isServerOnly(f) && !/\.test\.tsx?$/.test(f));

  it("no client-reachable file declares a VITE_ OpenSanctions alias", () => {
    const leaks = clientFiles.filter((f) => /VITE_OPEN_?SANCTIONS/i.test(readFileSync(f, "utf8")));
    expect(leaks).toEqual([]);
  });

  it("no client-reachable file calls the OpenSanctions API directly", () => {
    const leaks = clientFiles.filter((f) =>
      readFileSync(f, "utf8").includes("api.opensanctions.org"),
    );
    expect(leaks).toEqual([]);
  });

  it("the credential modal does not persist key material client-side", () => {
    const src = readFileSync(
      join(ROOT, "components/sanctions/ConnectOpenSanctionsDialog.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it("the server bridge reads the secret only inside the server module", () => {
    const src = readFileSync(join(ROOT, "lib/server/opensanctions.server.ts"), "utf8");
    expect(src).toContain("OPENSANCTIONS_API_KEY");
    const gateway = readFileSync(join(ROOT, "lib/opensanctions.functions.ts"), "utf8");
    expect(gateway).not.toContain("OPENSANCTIONS_API_KEY");
  });
});
