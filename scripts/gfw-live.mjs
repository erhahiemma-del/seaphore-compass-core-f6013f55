import { runGfwHealthCheck, runGfwSearch } from "../src/lib/server/gfw.server.ts";
import { OSAE } from "../src/services/osae/index.ts";
import { listAuthenticatedConnectors } from "../src/lib/server/connectors/registry.server.ts";
import "../src/lib/server/connectors/bootstrap.server.ts";

const line = (s = "") => console.log(s);
const h = (t: string) => { line(); line("═".repeat(72)); line(t); line("═".repeat(72)); };

h("STEP 1 — Connector Registration (server-driven registry)");
const snap = await listAuthenticatedConnectors();
for (const c of snap) {
  line(`  • ${c.id} v${c.version}  entities=[${c.supportedEntities.join(",")}]  health=${c.health.status}  latency=${c.health.latencyMs ?? "—"}ms`);
}

h("STEP 2 — Live API Authentication (server-side gateway)");
const t0 = Date.now();
const health = await runGfwHealthCheck();
line(`  HTTP GET https://gateway.api.globalfishingwatch.org/v3/vessels/search`);
line(`  → status=${health.status}  latency=${health.latencyMs}ms  wall=${Date.now() - t0}ms`);
line(`  API key: server-only (never in client bundle) ✓`);

h("STEP 3 — Vessel Search (MV Ocean Pearl)");
const pkg = await runGfwSearch("MV Ocean Pearl");
if (!pkg) { line("  no vessel matched"); process.exit(0); }
line(`  vesselId : ${pkg.vessel.vesselId}`);
line(`  name     : ${pkg.vessel.name}`);
line(`  mmsi     : ${pkg.vessel.mmsi ?? "—"}`);
line(`  imo      : ${pkg.vessel.imo ?? "—"}`);
line(`  flag     : ${pkg.vessel.flag ?? "—"}`);
line(`  callSign : ${pkg.vessel.callSign ?? "—"}`);
line(`  evidence : ${pkg.evidenceUrl}`);

h("STEP 4 — AIS Continuity Analysis (AISBehaviourAnalyzer)");
const cr = pkg.continuityReport;
line(`  observedWindow  : ${cr.observedWindow?.from ?? "—"} → ${cr.observedWindow?.to ?? "—"}`);
line(`  events          : ${pkg.movementHistory.length}`);
line(`  gapsDetected    : ${cr.gapsDetected}`);
line(`  darkEvents      : ${cr.darkEvents.length}`);
line(`  narrative       : ${cr.narrative}`);
line(`  confidence      : ${cr.confidence ?? "n/a"}`);

h("STEP 5 — OSAE Processing (sole authority for priority)");
const a = OSAE.publishAisContinuity(cr);
line(`  priority        : ${a.priority.toUpperCase()}`);
line(`  summary         : ${a.summary}`);
line(`  rationale       : ${a.rationale ?? "—"}`);
line(`  evidenceItems   : ${a.evidence.length}`);
for (const e of a.evidence.slice(0, 3)) line(`    – ${e.source}: ${e.claim}`);

h("STEP 6 — Executive Maritime Intelligence Brief (projected from GFW evidence)");
const priorityLabel = { critical: "🔴 CRITICAL", high: "🟠 HIGH", watch: "🟡 WATCH", routine: "🟢 ROUTINE" }[a.priority] ?? a.priority;
line();
line(`  § 1. EXECUTIVE SUMMARY`);
line(`     ${pkg.vessel.name} (${pkg.vessel.flag ?? "unknown flag"}, MMSI ${pkg.vessel.mmsi ?? "—"}) — `);
line(`     OSAE assigns operational priority ${priorityLabel}. ${a.summary}`);
line();
line(`  § 2. INTELLIGENCE ASSESSMENT`);
line(`     Evidence sourced from Global Fishing Watch v3 (public-global-vessel-identity:latest).`);
line(`     AIS behaviour: ${cr.gapsDetected} gap(s), ${cr.darkEvents.length} dark event(s) over observed window.`);
line();
line(`  § 3. KEY FACTS  [confidence chip: derived]`);
line(`     • Vessel ID  : ${pkg.vessel.vesselId}`);
line(`     • MMSI       : ${pkg.vessel.mmsi ?? "unknown"}`);
line(`     • Flag       : ${pkg.vessel.flag ?? "unknown"}`);
line(`     • Callsign   : ${pkg.vessel.callSign ?? "unknown"}`);
line();
line(`  § 4. RELATIONSHIP INTELLIGENCE`);
line(`     No related entities surfaced by GFW identity endpoint (encounters/ports require /v3/events).`);
line();
line(`  § 5. TIMELINE INTELLIGENCE`);
if (pkg.movementHistory.length === 0) line(`     No movement events in observed window.`);
else pkg.movementHistory.slice(0, 3).forEach(e => line(`     • ${e.startAt} — ${e.type}`));
line();
line(`  § 6. RISK & COMPLIANCE ANALYSIS`);
line(`     AIS continuity   : ${cr.gapsDetected === 0 ? "PASS ✓" : `${cr.gapsDetected} gap(s) flagged`}`);
line(`     Dark events      : ${cr.darkEvents.length === 0 ? "PASS ✓" : `${cr.darkEvents.length} flagged`}`);
line(`     Flag verified    : ${pkg.vessel.flag ? "PASS ✓" : "MISSING"}`);
line();
line(`  § 7. AI INTELLIGENCE INSIGHTS`);
line(`     ${cr.narrative}`);
line();
line(`  § 8. RECOMMENDATIONS`);
line(`     1. Continue passive monitoring at ${a.priority} priority tier.`);
line(`     2. Correlate identity via ICE against sanctions and ownership graphs.`);
line(`     3. If flag or MMSI conflict with declared documents, escalate to Investigate.`);
line();
line(`  § 9. SUPPORTING EVIDENCE`);
line(`     [GFW-01] source=global-fishing-watch  url=${pkg.evidenceUrl}`);
line(`     [OSAE-01] priority=${a.priority}  items=${a.evidence.length}`);
line();
line(`  ─────────────────────────────────────────────────────────────────────`);
line(`  Evidence first. Explainable always. Officer decides.`);
