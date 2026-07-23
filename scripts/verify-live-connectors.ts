/**
 * Sprint 1A.2.1 — Live Connector Verification.
 *
 * Read-only diagnostic. Enumerates every registered connector in the
 * canonical IAL registry, exercises each through the ConnectorManager
 * (never directly), and reports the pipeline path + health snapshot.
 */
import {
  getIntelligenceAcquisitionManager,
  __setDefaultManager,
  acquireEvidence,
} from "../src/services/ial";
import { listConnectors as listOsintConnectors } from "../src/lib/osint/registry";
import "../src/lib/osint/connectors";

const OSINT_NAMES = new Set(listOsintConnectors().map((c) => c.name));

function registrationSource(id: string): string {
  if (OSINT_NAMES.has(id)) return "src/lib/osint/connectors (production)";
  if (["ais", "equasis", "imo-gisis", "marinetraffic", "opensanctions"].includes(id)) {
    return "src/services/ial/connectors/simulated";
  }
  return "unknown";
}

function bridgeUsed(id: string): string {
  return OSINT_NAMES.has(id) ? "osint-bridge" : "none (native IAL)";
}

async function main() {
  const mode = process.env.IAL_MODE || "production";
  process.env.IAL_MODE = mode;
  __setDefaultManager(null);
  const mgr = getIntelligenceAcquisitionManager();
  await mgr.warmup();

  const registered = mgr.listConnectors();
  console.log(`\n=== 1. Registered Connectors (IAL_MODE=${mode}) ===`);
  console.log(`Total: ${registered.length}\n`);
  console.table(
    registered.map((c) => ({
      id: c.id,
      name: c.displayName,
      source: registrationSource(c.id),
      bridge: bridgeUsed(c.id),
    })),
  );

  console.log(`\n=== 2. Per-Connector Execution Through ConnectorManager ===`);
  const rows: Array<Record<string, unknown>> = [];
  for (const c of registered) {
    const started = Date.now();
    const pkg = await acquireEvidence({
      connectors: [c.id],
      entity: { kind: "vessel", id: "verify-probe", label: "Verify Probe" },
      forceRefresh: true,
      kinds: ["identity"],
    });
    rows.push({
      id: c.id,
      ok: pkg.issues.filter((i) => i.severity === "error").length === 0,
      verified: pkg.verified.length,
      sources: pkg.sources.length,
      issues: pkg.issues.length,
      ms: Date.now() - started,
    });
  }
  console.table(rows);

  console.log(`\n=== 3. Production Reachability ===`);
  const registeredIds = new Set(registered.map((c) => c.id));
  const missing: string[] = [];
  for (const name of OSINT_NAMES) {
    if (!registeredIds.has(name)) missing.push(name);
  }
  console.log(missing.length === 0
    ? `✅ All ${OSINT_NAMES.size} production connectors reachable through the canonical registry.`
    : `❌ Missing from canonical registry: ${missing.join(", ")}`);

  console.log(`\n=== 4/5. Mode Enforcement ===`);
  const simIds = new Set(["ais", "equasis", "imo-gisis", "marinetraffic", "opensanctions"]);
  const simsRegistered = registered.filter((c) => simIds.has(c.id));
  if (mode === "production") {
    console.log(simsRegistered.length === 0
      ? `✅ VITE_IAL_MODE=production → 0 simulators registered.`
      : `❌ VITE_IAL_MODE=production but simulators registered: ${simsRegistered.map((c) => c.id).join(", ")}`);
  }

  // Simulation mode check.
  __setDefaultManager(null);
  process.env.IAL_MODE = "simulation";
  const simMgr = getIntelligenceAcquisitionManager();
  await simMgr.warmup();
  const simList = simMgr.listConnectors();
  const onlySims = simList.every((c) => simIds.has(c.id));
  console.log(onlySims
    ? `✅ VITE_IAL_MODE=simulation → only simulators registered (${simList.length}).`
    : `❌ VITE_IAL_MODE=simulation includes non-simulators: ${simList.filter((c) => !simIds.has(c.id)).map((c) => c.id).join(", ")}`);

  // Restore production for path trace + health.
  __setDefaultManager(null);
  process.env.IAL_MODE = "production";
  const prodMgr = getIntelligenceAcquisitionManager();
  await prodMgr.warmup();

  console.log(`\n=== 6. Execution Path Trace (single connector) ===`);
  const sample = prodMgr.listConnectors()[0];
  if (sample) {
    console.log(`Officer
  ↓
OIE (query interpreter → mission builder)
  ↓
ICE (planner → correlator → package builder)
  ↓
IAL.acquireEvidence({ connectors: ["${sample.id}"], ... })
  ↓
ConnectorManager.acquire() → callWithTimeout(connector, query)
  ↓
osint-bridge.run(query) → osint.fetch() → normalizeRecord() → filter(entityMatches)
  ↓
${sample.displayName} (production connector, ${registrationSource(sample.id)})
  ↓
ConnectorResult → package-builder → EvidencePackage → ICE fusion → OIE briefing`);
  }

  console.log(`\n=== 7. Connector Health Report ===`);
  const health = prodMgr.getHealth();
  console.table(
    health.map((h) => ({
      id: h.connectorId,
      available: h.available,
      authenticated: h.authenticated,
      p50_ms: h.latencyMsP50,
      failure_rate: h.failureRate.toFixed(2),
      last_success: h.lastSuccessAt ?? "—",
      last_error: h.lastError ?? "—",
    })),
  );

  console.log(`\n=== Verification Complete ===\n`);
}

main().catch((e) => {
  console.error("verification failed:", e);
  process.exit(1);
});
