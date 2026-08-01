/**
 * SSOT contract test — the canonical Unified Intelligence Package.
 *
 * Guarantees that production routes/features never import the retired
 * demo-data or fixture modules directly. If this test fails, a demo-data
 * regression is being reintroduced into the officer-facing surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  registerUip,
  getUip,
  getUipByQueryHash,
  hashQuery,
  __resetUipRegistry,
  type UnifiedIntelligencePackage,
} from "@/services/ife";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (p.endsWith(".ts") || p.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

describe("UIP · single source of truth", () => {
  it("registers and resolves a package by id and query hash", () => {
    __resetUipRegistry();
    const stub = {
      id: "uip_test_1",
      createdAt: new Date().toISOString(),
      fused: { id: "fused_1", canonical: [], sources: [], contradictions: [] } as never,
      identity: [],
      osae: [],
      provenance: [],
      freshestSeconds: 0,
      hasContradictions: false,
    } as unknown as UnifiedIntelligencePackage;
    const qh = hashQuery("motor vessel dongwon 16");
    registerUip(stub, qh);
    expect(getUip("uip_test_1")).toBe(stub);
    expect(getUipByQueryHash(qh)?.id).toBe("uip_test_1");
  });

  it("production routes and features do not import demo-data fixtures", () => {
    const forbidden = ["@/lib/api/mock-dataset", "src/lib/api/mock-dataset", "@/mocks/api-dataset"];
    const roots = ["src/routes", "src/features"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (file.includes("/__tests__/") || file.endsWith(".stories.tsx")) continue;
        const src = readFileSync(file, "utf8");
        for (const f of forbidden) {
          if (src.includes(`"${f}"`) || src.includes(`'${f}'`)) {
            offenders.push(`${file} → ${f}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
