/**
 * Sprint 2.5 — Operational Intelligence Engine (OIE) · server surface.
 *
 * Read-only reasoning over the OKL store. No connector calls, no
 * re-computation of evidence, no writes to historical knowledge.
 *
 * All logic runs against `okl_records` + `okl_ingests`, both of which are
 * append-only by DB trigger and carry `source_uip_id`, `briefing_id`,
 * `investigation_id` on every row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  OieInsight,
  OieInsightBundle,
  OieProvenanceRef,
} from "@/services/oie-reasoning/types";

const Input = z.object({
  entityIds: z.array(z.string()).max(200).default([]),
  entityLabels: z.array(z.string()).max(200).default([]),
  investigationId: z.string().nullish(),
  limitPerLens: z.number().int().min(1).max(50).default(10),
});

type OklRow = {
  id: string;
  ingest_id: string;
  investigation_id: string;
  source_uip_id: string;
  briefing_id: string | null;
  kind: string;
  entity_id: string | null;
  entity_label: string | null;
  entity_kind: string | null;
  pattern_kind: string | null;
  risk_level: string | null;
  confidence: number | null;
  label: string | null;
  detail: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const RISK_WEIGHT: Record<string, number> = {
  CRITICAL: 100,
  HIGH: 80,
  ELEVATED: 65,
  MODERATE: 50,
  LOW: 30,
  INFO: 15,
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function pushProv(
  map: Map<string, OieProvenanceRef>,
  r: OklRow,
) {
  const key = `${r.investigation_id}::${r.source_uip_id}::${r.briefing_id ?? ""}`;
  const cur = map.get(key) ?? {
    investigationId: r.investigation_id,
    sourceUipId: r.source_uip_id,
    briefingId: r.briefing_id,
    oklRecordIds: [],
  };
  cur.oklRecordIds.push(r.id);
  map.set(key, cur);
}

function provList(m: Map<string, OieProvenanceRef>) {
  return Array.from(m.values());
}

export const generateOieInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<OieInsightBundle> => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const emptyBundle: OieInsightBundle = {
      subjectEntityIds: data.entityIds,
      subjectEntityLabels: data.entityLabels,
      investigationId: data.investigationId ?? undefined,
      generatedAt: now,
      insights: [],
      stats: { recordsScanned: 0, investigationsTouched: 0, uipsTouched: 0 },
    };

    if (data.entityIds.length === 0 && data.entityLabels.length === 0) {
      return emptyBundle;
    }

    // Pull related OKL records once — all reasoning derives from this set.
    let q = supabase
      .from("okl_records")
      .select(
        "id, ingest_id, investigation_id, source_uip_id, briefing_id, kind, entity_id, entity_label, entity_kind, pattern_kind, risk_level, confidence, label, detail, payload, created_at",
      )
      .limit(2000);

    const orClauses: string[] = [];
    if (data.entityIds.length > 0) {
      orClauses.push(
        `entity_id.in.(${data.entityIds.map((s) => `"${s.replace(/"/g, "")}"`).join(",")})`,
      );
    }
    if (data.entityLabels.length > 0) {
      orClauses.push(
        `entity_label.in.(${data.entityLabels.map((s) => `"${s.replace(/"/g, "")}"`).join(",")})`,
      );
    }
    q = q.or(orClauses.join(","));

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const records = (rows ?? []) as OklRow[];

    if (records.length === 0) return emptyBundle;

    const subjectInvId = data.investigationId ?? null;
    const insights: OieInsight[] = [];

    // Global stats
    const invSet = new Set<string>();
    const uipSet = new Set<string>();
    for (const r of records) {
      invSet.add(r.investigation_id);
      uipSet.add(r.source_uip_id);
    }

    // Subject fingerprint (entities the caller is investigating).
    const subjectIds = new Set(data.entityIds);
    const subjectLabels = new Set(data.entityLabels.map((s) => s.toLowerCase()));

    // Group records by investigation for similarity + outcomes reasoning.
    const byInvestigation = new Map<string, OklRow[]>();
    for (const r of records) {
      const list = byInvestigation.get(r.investigation_id) ?? [];
      list.push(r);
      byInvestigation.set(r.investigation_id, list);
    }

    // ── 1. SIMILAR_INVESTIGATION ────────────────────────────────────────
    // Jaccard-style overlap on entity ids/labels, excluding the subject inv.
    const subjectSize = subjectIds.size + subjectLabels.size || 1;
    const similar: Array<{ invId: string; overlap: number; jaccard: number; rows: OklRow[] }> = [];
    for (const [invId, list] of byInvestigation) {
      if (subjectInvId && invId === subjectInvId) continue;
      const invIds = new Set<string>();
      const invLabels = new Set<string>();
      for (const r of list) {
        if (r.entity_id) invIds.add(r.entity_id);
        if (r.entity_label) invLabels.add(r.entity_label.toLowerCase());
      }
      let overlap = 0;
      for (const id of subjectIds) if (invIds.has(id)) overlap += 1;
      for (const lb of subjectLabels) if (invLabels.has(lb)) overlap += 1;
      if (overlap === 0) continue;
      const union = subjectSize + invIds.size + invLabels.size - overlap || 1;
      similar.push({ invId, overlap, jaccard: overlap / union, rows: list });
    }
    similar.sort((a, b) => b.jaccard - a.jaccard);
    for (const s of similar.slice(0, data.limitPerLens)) {
      const prov = new Map<string, OieProvenanceRef>();
      for (const r of s.rows) pushProv(prov, r);
      const conf = clamp(Math.round(40 + s.jaccard * 60));
      insights.push({
        id: `oie:similar:${s.invId}`,
        kind: "SIMILAR_INVESTIGATION",
        title: `Similar investigation ${s.invId.slice(0, 8)}`,
        summary: `Shares ${s.overlap} entity match${s.overlap === 1 ? "" : "es"} with the current subject.`,
        rationale: `Jaccard overlap ${s.jaccard.toFixed(2)} across ${s.rows.length} OKL record${s.rows.length === 1 ? "" : "s"} spanning ${new Set(s.rows.map((r) => r.source_uip_id)).size} UIP snapshot(s). Historical knowledge only — no connector was called.`,
        confidence: conf,
        signals: {
          jaccard: Number(s.jaccard.toFixed(3)),
          overlapCount: s.overlap,
          recordCount: s.rows.length,
        },
        provenance: provList(prov),
        createdAt: now,
      });
    }

    // ── 2. RECURRING_PATTERN ────────────────────────────────────────────
    const patternMap = new Map<
      string,
      { kind: string; rows: OklRow[]; invs: Set<string>; maxConf: number; sample?: string }
    >();
    for (const r of records) {
      if (r.kind !== "PATTERN" || !r.pattern_kind) continue;
      const cur = patternMap.get(r.pattern_kind) ?? {
        kind: r.pattern_kind,
        rows: [],
        invs: new Set<string>(),
        maxConf: 0,
        sample: r.label ?? undefined,
      };
      cur.rows.push(r);
      cur.invs.add(r.investigation_id);
      cur.maxConf = Math.max(cur.maxConf, r.confidence ?? 0);
      patternMap.set(r.pattern_kind, cur);
    }
    const patternList = Array.from(patternMap.values())
      .filter((p) => p.rows.length >= 2 || p.invs.size >= 2)
      .sort((a, b) => b.rows.length - a.rows.length)
      .slice(0, data.limitPerLens);
    for (const p of patternList) {
      const prov = new Map<string, OieProvenanceRef>();
      for (const r of p.rows) pushProv(prov, r);
      const breadth = clamp(20 + p.invs.size * 15);
      const conf = clamp(Math.round((p.maxConf * 0.6) + breadth * 0.4));
      insights.push({
        id: `oie:pattern:${p.kind}`,
        kind: "RECURRING_PATTERN",
        title: p.sample ?? p.kind,
        summary: `${p.rows.length} occurrence${p.rows.length === 1 ? "" : "s"} across ${p.invs.size} investigation${p.invs.size === 1 ? "" : "s"}.`,
        rationale: `Pattern kind "${p.kind}" repeats in the OKL store with peak per-instance confidence ${p.maxConf}. Cross-case breadth score ${breadth}. Officer decides whether the pattern applies to the current subject.`,
        confidence: conf,
        signals: {
          occurrences: p.rows.length,
          investigationCount: p.invs.size,
          maxRecordConfidence: p.maxConf,
        },
        provenance: provList(prov),
        createdAt: now,
      });
    }

    // ── 3. HISTORICAL_OUTCOME ───────────────────────────────────────────
    // Pair DECISION + OUTCOME rows within the same investigation.
    for (const [invId, list] of byInvestigation) {
      if (subjectInvId && invId === subjectInvId) continue;
      const decisions = list.filter((r) => r.kind === "DECISION");
      const outcomes = list.filter((r) => r.kind === "OUTCOME");
      if (decisions.length === 0 && outcomes.length === 0) continue;
      const rows = [...decisions, ...outcomes];
      const prov = new Map<string, OieProvenanceRef>();
      for (const r of rows) pushProv(prov, r);
      const avgConf = Math.round(
        rows.reduce((acc, r) => acc + (r.confidence ?? 50), 0) / rows.length,
      );
      insights.push({
        id: `oie:outcome:${invId}`,
        kind: "HISTORICAL_OUTCOME",
        title: `Prior outcome · investigation ${invId.slice(0, 8)}`,
        summary: `${decisions.length} decision${decisions.length === 1 ? "" : "s"} · ${outcomes.length} recorded outcome${outcomes.length === 1 ? "" : "s"}.`,
        rationale: `Historical decision/outcome pairing surfaced from prior investigations that touched the same subject. Read-only playback of the OKL record trail; no re-computation.`,
        confidence: clamp(avgConf),
        signals: {
          decisions: decisions.length,
          outcomes: outcomes.length,
        },
        provenance: provList(prov),
        createdAt: now,
      });
      if (insights.filter((i) => i.kind === "HISTORICAL_OUTCOME").length >= data.limitPerLens) break;
    }

    // ── 4. EMERGING_RISK ────────────────────────────────────────────────
    // Recent risk rows (last 60 days) grouped by entity.
    const horizon = Date.now() - 60 * 24 * 3600 * 1000;
    const emergingMap = new Map<
      string,
      { level: string; label: string; entityId: string | null; rows: OklRow[] }
    >();
    for (const r of records) {
      if (r.kind !== "RISK" || !r.risk_level) continue;
      if (Date.parse(r.created_at) < horizon) continue;
      const key = `${r.risk_level}::${r.entity_id ?? r.entity_label ?? "—"}`;
      const cur = emergingMap.get(key) ?? {
        level: r.risk_level,
        label: r.entity_label ?? "—",
        entityId: r.entity_id,
        rows: [],
      };
      cur.rows.push(r);
      emergingMap.set(key, cur);
    }
    const emerging = Array.from(emergingMap.values())
      .sort(
        (a, b) =>
          (RISK_WEIGHT[b.level] ?? 50) - (RISK_WEIGHT[a.level] ?? 50) ||
          b.rows.length - a.rows.length,
      )
      .slice(0, data.limitPerLens);
    for (const e of emerging) {
      const prov = new Map<string, OieProvenanceRef>();
      for (const r of e.rows) pushProv(prov, r);
      const conf = clamp(
        Math.round((RISK_WEIGHT[e.level] ?? 50) * 0.7 + Math.min(e.rows.length, 5) * 6),
      );
      insights.push({
        id: `oie:emerging-risk:${e.level}:${e.entityId ?? e.label}`,
        kind: "EMERGING_RISK",
        title: `${e.level} risk trending on ${e.label}`,
        summary: `${e.rows.length} recent OKL risk record${e.rows.length === 1 ? "" : "s"} in the last 60 days.`,
        rationale: `Risk band ${e.level} recurs on this entity within the recent window. Weight ${RISK_WEIGHT[e.level] ?? 50}; recency multiplier applied. Officer decides whether escalation is warranted.`,
        confidence: conf,
        signals: {
          riskLevel: e.level,
          recentOccurrences: e.rows.length,
        },
        provenance: provList(prov),
        createdAt: now,
      });
    }

    // ── 5. RECOMMENDATION_EFFECTIVENESS ─────────────────────────────────
    // For each RECOMMENDATION, check whether an OUTCOME row followed it in
    // the same investigation.
    const recs = records.filter((r) => r.kind === "RECOMMENDATION");
    const outcomesByInv = new Map<string, OklRow[]>();
    for (const r of records) {
      if (r.kind !== "OUTCOME") continue;
      const list = outcomesByInv.get(r.investigation_id) ?? [];
      list.push(r);
      outcomesByInv.set(r.investigation_id, list);
    }
    const recBuckets = new Map<
      string,
      { label: string; total: number; withOutcome: number; rows: OklRow[]; outcomeRows: OklRow[] }
    >();
    for (const rec of recs) {
      const key = rec.label ?? rec.pattern_kind ?? "recommendation";
      const cur = recBuckets.get(key) ?? {
        label: key,
        total: 0,
        withOutcome: 0,
        rows: [],
        outcomeRows: [],
      };
      cur.total += 1;
      cur.rows.push(rec);
      const followUps = (outcomesByInv.get(rec.investigation_id) ?? []).filter(
        (o) => Date.parse(o.created_at) >= Date.parse(rec.created_at),
      );
      if (followUps.length > 0) {
        cur.withOutcome += 1;
        cur.outcomeRows.push(...followUps);
      }
      recBuckets.set(key, cur);
    }
    const recList = Array.from(recBuckets.values())
      .filter((v) => v.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, data.limitPerLens);
    for (const rec of recList) {
      const prov = new Map<string, OieProvenanceRef>();
      for (const r of [...rec.rows, ...rec.outcomeRows]) pushProv(prov, r);
      const ratio = rec.total > 0 ? rec.withOutcome / rec.total : 0;
      const conf = clamp(Math.round(30 + ratio * 60 + Math.min(rec.total, 5) * 2));
      insights.push({
        id: `oie:rec-eff:${rec.label}`,
        kind: "RECOMMENDATION_EFFECTIVENESS",
        title: `Recommendation "${rec.label}"`,
        summary: `${rec.withOutcome}/${rec.total} historical instances have a recorded outcome.`,
        rationale: `Effectiveness ratio ${(ratio * 100).toFixed(0)}% derived from OKL RECOMMENDATION↔OUTCOME pairings. Ratio does not imply causation — officer decides whether to reissue the recommendation.`,
        confidence: conf,
        signals: {
          totalIssued: rec.total,
          withRecordedOutcome: rec.withOutcome,
          effectivenessRatio: Number(ratio.toFixed(3)),
        },
        provenance: provList(prov),
        createdAt: now,
      });
    }

    // ── 6. CROSS_CASE_RELATIONSHIP ──────────────────────────────────────
    // Entities that co-appear across ≥2 investigations with the subject.
    const entityToInvs = new Map<string, { label: string; invs: Set<string>; rows: OklRow[] }>();
    for (const r of records) {
      const key = r.entity_id ?? r.entity_label;
      if (!key) continue;
      const isSubject =
        (r.entity_id && subjectIds.has(r.entity_id)) ||
        (r.entity_label && subjectLabels.has(r.entity_label.toLowerCase()));
      if (isSubject) continue;
      const cur = entityToInvs.get(key) ?? {
        label: r.entity_label ?? key,
        invs: new Set<string>(),
        rows: [],
      };
      cur.invs.add(r.investigation_id);
      cur.rows.push(r);
      entityToInvs.set(key, cur);
    }
    const cross = Array.from(entityToInvs.entries())
      .filter(([, v]) => v.invs.size >= 2)
      .sort((a, b) => b[1].invs.size - a[1].invs.size)
      .slice(0, data.limitPerLens);
    for (const [key, v] of cross) {
      const prov = new Map<string, OieProvenanceRef>();
      for (const r of v.rows) pushProv(prov, r);
      const conf = clamp(30 + v.invs.size * 15);
      insights.push({
        id: `oie:cross:${key}`,
        kind: "CROSS_CASE_RELATIONSHIP",
        title: `${v.label} bridges ${v.invs.size} investigations`,
        summary: `Co-appears alongside the current subject in ${v.invs.size} historical cases.`,
        rationale: `Cross-case bridge derived from OKL entity co-occurrence. Every co-occurrence links back to its `source_uip_id`; no connector call.`,
        confidence: conf,
        signals: {
          bridgingInvestigations: v.invs.size,
          totalRecords: v.rows.length,
        },
        provenance: provList(prov),
        createdAt: now,
      });
    }

    // Deterministic order: kind, then confidence desc.
    insights.sort((a, b) =>
      a.kind === b.kind ? b.confidence - a.confidence : a.kind.localeCompare(b.kind),
    );

    return {
      subjectEntityIds: data.entityIds,
      subjectEntityLabels: data.entityLabels,
      investigationId: data.investigationId ?? undefined,
      generatedAt: now,
      insights,
      stats: {
        recordsScanned: records.length,
        investigationsTouched: invSet.size,
        uipsTouched: uipSet.size,
      },
    };
  });
