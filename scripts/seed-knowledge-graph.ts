/**
 * Sprint 4 — Knowledge Graph seed (TypeScript, idempotent)
 *
 * Schema diagram:
 *
 *   entities ──┬──< relationships >──┬── entities              (verified edges)
 *              ├──< candidate_relationships >──┐               (pending/approved/rejected)
 *              └──< evidence (id ⇢ entities.id)                (version_history + provenance)
 *
 *   investigations (id ⇢ entities.id, soft-delete via deleted_at)
 *      ├──< evidence      (RESTRICT)
 *      ├──< sessions      (SET NULL)
 *      └──< briefings
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/seed-knowledge-graph.ts
 *
 * Idempotent: safe to re-run. Prefer the SQL migration for production;
 * this script is for local repeatability and CI smoke tests.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const db = createClient(url, key, { auth: { persistSession: false } });

async function upsertEntity(row: {
  type: string;
  name: string;
  attributes: Record<string, unknown>;
  source_id: string;
  source_name: string;
  aliases?: string[];
}) {
  const { data: existing } = await db
    .from("entities")
    .select("id")
    .eq("type", row.type)
    .eq("name", row.name)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await db
    .from("entities")
    .insert({ ...row, confidence: "VERIFIED", aliases: row.aliases ?? [] })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function main() {
  const vesselId = await upsertEntity({
    type: "vessel",
    name: "MV Crimson Endeavour",
    aliases: ["Crimson Endeavour"],
    attributes: { imo: "9837456", flag: "LR", type: "General Cargo", built: 2015 },
    source_id: "IMO-9837456",
    source_name: "IMO Registry",
  });

  const companyId = await upsertEntity({
    type: "company",
    name: "Oceanic Lines Ltd",
    attributes: { jurisdiction: "LR", registration: "LR-88231", role: "registered_owner" },
    source_id: "CORP-LR-88231",
    source_name: "Liberia Corporate Registry",
  });

  const portId = await upsertEntity({
    type: "port",
    name: "Apapa Anchorage",
    attributes: { country: "NG", city: "Lagos", locode: "NGAPP", lat: 6.4489, lon: 3.3663 },
    source_id: "UNLOCODE-NGAPP",
    source_name: "UN/LOCODE",
  });

  const invEntityId = await upsertEntity({
    type: "investigation",
    name: "INV-2026-00431",
    attributes: { case_number: "INV-2026-00431" },
    source_id: "INV-2026-00431",
    source_name: "Seaphore Case Register",
  });

  // Investigation row (reuses entity id)
  const { data: existingInv } = await db
    .from("investigations")
    .select("id")
    .eq("case_number", "INV-2026-00431")
    .maybeSingle();
  if (!existingInv) {
    const { data: role } = await db
      .from("user_roles")
      .select("user_id")
      .order("granted_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!role?.user_id) throw new Error("Seed a user_role first — investigations.lead_officer_id is NOT NULL");
    const { error } = await db.from("investigations").insert({
      id: invEntityId,
      case_number: "INV-2026-00431",
      scenario:
        "Suspected ownership obfuscation for MV Crimson Endeavour docking at Apapa Anchorage",
      status: "open",
      lead_officer_id: role.user_id,
    });
    if (error) throw error;
  }

  // Verified edges
  const edges = [
    { source_id: companyId, target_id: vesselId, type: "OPERATES", confidence: "VERIFIED" as const },
    { source_id: vesselId, target_id: portId, type: "DOCKED_AT", confidence: "CORROBORATED" as const },
  ];
  for (const e of edges) {
    const { data: exists } = await db
      .from("relationships")
      .select("id")
      .match(e)
      .maybeSingle();
    if (!exists) await db.from("relationships").insert(e).throwOnError();
  }

  // Candidate edge
  const { data: cand } = await db
    .from("candidate_relationships")
    .select("id")
    .eq("source_entity_id", companyId)
    .eq("target_entity_id", vesselId)
    .eq("type", "BENEFICIAL_OWNER_OF")
    .maybeSingle();
  if (!cand) {
    await db
      .from("candidate_relationships")
      .insert({
        source_entity_id: companyId,
        target_entity_id: vesselId,
        type: "BENEFICIAL_OWNER_OF",
        confidence: 0.62,
        inferred_by: "ownership-inference-agent",
        reasoning: "Shared director and registered address overlap with historical shell entities.",
        status: "pending",
      })
      .throwOnError();
  }

  // Evidence with version history + provenance
  const { data: evExists } = await db
    .from("evidence")
    .select("id")
    .eq("investigation_id", invEntityId)
    .eq("content_hash", "sha256:seed-v1")
    .maybeSingle();
  if (!evExists) {
    const evEntityId = await upsertEntity({
      type: "document",
      name: "AIS Track — MV Crimson Endeavour (seed)",
      attributes: { kind: "ais_track", hash: "sha256:seed-v1" },
      source_id: "AIS-2026-04-01",
      source_name: "MarineTraffic AIS",
    });
    await db
      .from("evidence")
      .insert({
        id: evEntityId,
        investigation_id: invEntityId,
        evidence_type: "ais_track",
        source: "MarineTraffic AIS",
        content_hash: "sha256:seed-v1",
        version_history: [
          {
            version: 1,
            at: new Date().toISOString(),
            actor: "ingest.marinetraffic",
            change: "initial ingest",
            hash: "sha256:seed-v1",
          },
        ],
        provenance: {
          collected_from: "MarineTraffic API v2",
          method: "poll",
          chain_of_custody: ["ingest.marinetraffic", "ais.normalizer"],
          received_at: new Date().toISOString(),
        },
      })
      .throwOnError();
  }

  console.log("✓ Knowledge Graph seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
