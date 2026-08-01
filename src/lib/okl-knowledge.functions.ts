/**
 * OKL Knowledge Store — server functions (Sprint 2.4).
 *
 * Consumes only the Canonical UIP + a workspace snapshot the client
 * already assembled. Never touches raw connectors or Data API sources
 * outside the OKL tables. Every write is immutable (DB triggers block
 * UPDATE/DELETE) and stamped with `source_uip_id`, `briefing_id`, and
 * `investigation_id` so full provenance survives.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RecordKind = z.enum([
  "ENTITY",
  "RELATIONSHIP",
  "PATTERN",
  "RISK",
  "DECISION",
  "OUTCOME",
  "RECOMMENDATION",
]);

const RecordInput = z.object({
  kind: RecordKind,
  entityId: z.string().nullish(),
  entityLabel: z.string().nullish(),
  entityKind: z.string().nullish(),
  patternKind: z.string().nullish(),
  riskLevel: z.string().nullish(),
  confidence: z.number().int().min(0).max(100).nullish(),
  label: z.string().nullish(),
  detail: z.string().nullish(),
  payload: z.record(z.unknown()).default({}),
});

const PersistInput = z.object({
  investigationId: z.string().min(1),
  investigationTitle: z.string().nullish(),
  sourceUipId: z.string().min(1),
  briefingId: z.string().nullish(),
  officerName: z.string().nullish(),
  packageId: z.string().min(1),
  overallConfidence: z.number().int().min(0).max(100).nullish(),
  overallRisk: z.string().nullish(),
  snapshot: z.record(z.unknown()),
  records: z.array(RecordInput).max(2000),
});

export type PersistOklIngestInput = z.infer<typeof PersistInput>;

export const persistOklIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => PersistInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Version: monotonically increasing per investigation.
    const { data: prior } = await supabase
      .from("okl_ingests")
      .select("version")
      .eq("investigation_id", data.investigationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (prior?.version ?? 0) + 1;

    const patternCount = data.records.filter((r) => r.kind === "PATTERN").length;
    const entityCount = data.records.filter((r) => r.kind === "ENTITY").length;
    const decisionCount = data.records.filter((r) => r.kind === "DECISION").length;

    const { data: ingest, error: ingestErr } = await supabase
      .from("okl_ingests")
      .insert({
        investigation_id: data.investigationId,
        investigation_title: data.investigationTitle ?? null,
        source_uip_id: data.sourceUipId,
        briefing_id: data.briefingId ?? null,
        officer_id: userId,
        officer_name: data.officerName ?? null,
        package_id: data.packageId,
        version,
        overall_confidence: data.overallConfidence ?? null,
        overall_risk: data.overallRisk ?? null,
        pattern_count: patternCount,
        entity_count: entityCount,
        decision_count: decisionCount,
        snapshot: data.snapshot as never,
      })
      .select("id, created_at, version")
      .single();

    if (ingestErr || !ingest) throw new Error(ingestErr?.message ?? "OKL ingest failed");

    if (data.records.length > 0) {
      const rows = data.records.map((r) => ({
        ingest_id: ingest.id,
        investigation_id: data.investigationId,
        source_uip_id: data.sourceUipId,
        briefing_id: data.briefingId ?? null,
        kind: r.kind,
        entity_id: r.entityId ?? null,
        entity_label: r.entityLabel ?? null,
        entity_kind: r.entityKind ?? null,
        pattern_kind: r.patternKind ?? null,
        risk_level: r.riskLevel ?? null,
        confidence: r.confidence ?? null,
        label: r.label ?? null,
        detail: r.detail ?? null,
        payload: r.payload as never,
      }));
      const { error: recErr } = await supabase.from("okl_records").insert(rows);
      if (recErr) throw new Error(recErr.message);
    }

    return {
      ok: true,
      ingestId: ingest.id,
      version: ingest.version,
      createdAt: ingest.created_at,
      recordCount: data.records.length,
    };
  });

// --- Cross-investigation queries -----------------------------------

const QueryInput = z.object({
  entityIds: z.array(z.string()).max(200).default([]),
  entityLabels: z.array(z.string()).max(200).default([]),
  excludeInvestigationId: z.string().nullish(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const queryOklKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => QueryInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const empty = data.entityIds.length === 0 && data.entityLabels.length === 0;
    if (empty) {
      return {
        relatedInvestigations: [],
        knownPatterns: [],
        historicalDecisions: [],
        recurringRisks: [],
      };
    }

    // Base filter: entity_id in list OR entity_label in list (case-insensitive).
    let q = supabase
      .from("okl_records")
      .select(
        "id, ingest_id, investigation_id, source_uip_id, briefing_id, kind, entity_id, entity_label, pattern_kind, risk_level, confidence, label, detail, payload, created_at",
      )
      .limit(1000);

    const clauses: string[] = [];
    if (data.entityIds.length > 0) {
      clauses.push(
        `entity_id.in.(${data.entityIds.map((s) => `"${s.replace(/"/g, "")}"`).join(",")})`,
      );
    }
    if (data.entityLabels.length > 0) {
      clauses.push(
        `entity_label.in.(${data.entityLabels.map((s) => `"${s.replace(/"/g, "")}"`).join(",")})`,
      );
    }
    q = q.or(clauses.join(","));
    if (data.excludeInvestigationId) {
      q = q.neq("investigation_id", data.excludeInvestigationId);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const records = rows ?? [];

    // Related investigations — group by investigation_id.
    const invMap = new Map<
      string,
      {
        investigationId: string;
        sourceUipIds: Set<string>;
        briefingIds: Set<string>;
        entityIds: Set<string>;
        recordCount: number;
        lastSeen: string;
      }
    >();
    for (const r of records) {
      const cur = invMap.get(r.investigation_id) ?? {
        investigationId: r.investigation_id,
        sourceUipIds: new Set<string>(),
        briefingIds: new Set<string>(),
        entityIds: new Set<string>(),
        recordCount: 0,
        lastSeen: r.created_at,
      };
      cur.sourceUipIds.add(r.source_uip_id);
      if (r.briefing_id) cur.briefingIds.add(r.briefing_id);
      if (r.entity_id) cur.entityIds.add(r.entity_id);
      cur.recordCount += 1;
      if (r.created_at > cur.lastSeen) cur.lastSeen = r.created_at;
      invMap.set(r.investigation_id, cur);
    }
    const relatedInvestigations = Array.from(invMap.values())
      .map((v) => ({
        investigationId: v.investigationId,
        sourceUipIds: Array.from(v.sourceUipIds),
        briefingIds: Array.from(v.briefingIds),
        matchedEntityIds: Array.from(v.entityIds),
        recordCount: v.recordCount,
        lastSeen: v.lastSeen,
      }))
      .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1))
      .slice(0, data.limit);

    // Known patterns — group by pattern_kind.
    const patternMap = new Map<
      string,
      {
        kind: string;
        count: number;
        investigations: Set<string>;
        sampleLabel?: string;
        lastSeen: string;
        maxConfidence: number;
      }
    >();
    for (const r of records) {
      if (r.kind !== "PATTERN" || !r.pattern_kind) continue;
      const cur = patternMap.get(r.pattern_kind) ?? {
        kind: r.pattern_kind,
        count: 0,
        investigations: new Set<string>(),
        sampleLabel: r.label ?? undefined,
        lastSeen: r.created_at,
        maxConfidence: 0,
      };
      cur.count += 1;
      cur.investigations.add(r.investigation_id);
      if (r.created_at > cur.lastSeen) cur.lastSeen = r.created_at;
      if ((r.confidence ?? 0) > cur.maxConfidence) cur.maxConfidence = r.confidence ?? 0;
      patternMap.set(r.pattern_kind, cur);
    }
    const knownPatterns = Array.from(patternMap.values())
      .map((v) => ({
        patternKind: v.kind,
        count: v.count,
        investigationCount: v.investigations.size,
        sampleLabel: v.sampleLabel,
        lastSeen: v.lastSeen,
        maxConfidence: v.maxConfidence,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, data.limit);

    // Historical decisions.
    const historicalDecisions = records
      .filter((r) => r.kind === "DECISION")
      .map((r) => ({
        recordId: r.id,
        investigationId: r.investigation_id,
        sourceUipId: r.source_uip_id,
        briefingId: r.briefing_id,
        label: r.label ?? "Decision",
        detail: r.detail ?? null,
        confidence: r.confidence ?? null,
        payload: r.payload,
        createdAt: r.created_at,
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, data.limit);

    // Recurring risks — group by risk_level + entity.
    const riskMap = new Map<
      string,
      {
        riskLevel: string;
        entityLabel: string;
        entityId: string | null;
        count: number;
        investigations: Set<string>;
        lastSeen: string;
      }
    >();
    for (const r of records) {
      if (r.kind !== "RISK" || !r.risk_level) continue;
      const key = `${r.risk_level}::${r.entity_id ?? r.entity_label ?? "—"}`;
      const cur = riskMap.get(key) ?? {
        riskLevel: r.risk_level,
        entityLabel: r.entity_label ?? "—",
        entityId: r.entity_id,
        count: 0,
        investigations: new Set<string>(),
        lastSeen: r.created_at,
      };
      cur.count += 1;
      cur.investigations.add(r.investigation_id);
      if (r.created_at > cur.lastSeen) cur.lastSeen = r.created_at;
      riskMap.set(key, cur);
    }
    const recurringRisks = Array.from(riskMap.values())
      .filter((v) => v.count > 1 || v.investigations.size > 1)
      .map((v) => ({
        riskLevel: v.riskLevel,
        entityId: v.entityId,
        entityLabel: v.entityLabel,
        occurrences: v.count,
        investigationCount: v.investigations.size,
        lastSeen: v.lastSeen,
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, data.limit);

    return { relatedInvestigations, knownPatterns, historicalDecisions, recurringRisks };
  });

const IngestListInput = z.object({
  investigationId: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const listOklIngests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => IngestListInput.parse(raw))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("okl_ingests")
      .select(
        "id, investigation_id, investigation_title, source_uip_id, briefing_id, officer_name, version, overall_confidence, overall_risk, pattern_count, entity_count, decision_count, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.investigationId) q = q.eq("investigation_id", data.investigationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { ingests: rows ?? [] };
  });
