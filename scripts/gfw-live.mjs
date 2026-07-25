import { runGfwHealthCheck, runGfwSearch } from "../src/lib/server/gfw.server.ts";
import { OSAE } from "../src/services/osae/index.ts";

console.log("KEY_LEN", (process.env.GLOBAL_FISHING_WATCH_API_KEY || "").length);
const t0 = Date.now();
const health = await runGfwHealthCheck();
console.log("HEALTH", JSON.stringify(health), `wall=${Date.now() - t0}ms`);

// Ocean Pearl first; if it yields no identifiable vessel, fall back to
// a well-known GFW-indexed vessel and state which one was used.
const primary = ["MV Ocean Pearl", "OCEAN PEARL"];
const fallbacks = ["MAERSK VILNIUS", "CMA CGM MARCO POLO", "EVER GIVEN"];
let used = "";
let pkg = null;
for (const q of [...primary, ...fallbacks]) {
  const t1 = Date.now();
  try {
    const p = await runGfwSearch(q);
    const ok = p && (p.vessel.imo || p.vessel.mmsi || p.vessel.flag);
    console.log(
      "SEARCH",
      q,
      p
        ? JSON.stringify({
            vessel: p.vessel,
            lastPosition: p.lastPosition,
            events: p.movementHistory.length,
            gaps: p.continuityReport.gapsDetected,
            longestH: p.continuityReport.darkEvents.reduce(
              (m, d) => Math.max(m, d.durationHours),
              0,
            ),
            confidence: p.continuityReport.confidence ?? null,
            evidenceUrl: p.evidenceUrl,
          })
        : "null",
      `wall=${Date.now() - t1}ms`,
    );
    if (ok) {
      pkg = p;
      used = q;
      break;
    }
  } catch (e) {
    console.log("SEARCH_ERR", q, e?.code, e?.message?.slice(0, 120));
  }
}

if (pkg) {
  const assessment = OSAE.publishAisContinuity(pkg.continuityReport);
  console.log(
    "OSAE_ASSESSMENT",
    JSON.stringify({
      usedVessel: used,
      priority: assessment.priority,
      summary: assessment.summary,
      evidenceCount: assessment.evidence.length,
    }),
  );
} else {
  console.log("OSAE_ASSESSMENT", "no evidence package produced");
}
