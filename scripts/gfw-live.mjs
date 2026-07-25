import { runGfwHealthCheck, runGfwSearch } from "../src/lib/server/gfw.server.ts";
console.log("KEY_LEN", (process.env.GLOBAL_FISHING_WATCH_API_KEY || "").length);
const t0 = Date.now();
const health = await runGfwHealthCheck();
console.log("HEALTH", JSON.stringify(health), `wall=${Date.now() - t0}ms`);
for (const q of ["MV Ocean Pearl", "OCEAN PEARL", "MAERSK", "EVER GIVEN"]) {
  const t1 = Date.now();
  try {
    const pkg = await runGfwSearch(q);
    console.log("SEARCH", q, JSON.stringify(pkg && {
      vessel: pkg.vessel, lastPosition: pkg.lastPosition,
      events: pkg.movementHistory.length,
      gaps: pkg.continuityReport.gapsDetected,
      longestH: pkg.continuityReport.darkEvents.reduce((m,d)=>Math.max(m,d.durationHours),0),
      evidenceUrl: pkg.evidenceUrl,
    }), `wall=${Date.now()-t1}ms`);
    if (pkg) break;
  } catch (e) { console.log("SEARCH_ERR", q, e?.code, e?.message); }
}
