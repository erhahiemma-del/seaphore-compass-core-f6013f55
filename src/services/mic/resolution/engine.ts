/**
 * INT-01B — Entity Resolution Engine
 *
 * Deduplicates Intelligence Objects in the IntelligenceObjectRegistry
 * using deterministic identifier matching + normalised name similarity.
 *
 * Never modifies evidence. Never invents merges. Every merge produces a
 * ResolutionDecision with the signals that justified it.
 *
 * Integration: called by MicContainer after buildIntelligenceObjects().
 */
import type { IntelligenceObject, IntelligenceObjectKind } from "../entities/types";
import type { IntelligenceObjectRegistry } from "../entities/registry";
import type { ResolutionDecision, ResolutionSignal, EntityResolutionResult, ResolutionMethod } from "./types";

// ─── Name normalisation ───────────────────────────────────────────────

function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|corp|corporation|co|llc|plc|sa|bv|gmbh|srl)\b\.?/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Token-set similarity: tokenise both names, intersect, compute Jaccard.
 * Returns 0..1. Values ≥ 0.85 are treated as strong name matches.
 */
function tokenSetSimilarity(a: string, b: string): number {
  const tokA = new Set(normaliseName(a).split(" ").filter(Boolean));
  const tokB = new Set(normaliseName(b).split(" ").filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return intersection / union;
}

// ─── Field extractors ─────────────────────────────────────────────────

type Fields = Record<string, unknown>;

function getStr(attrs: Fields, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === "string" && v.trim()) return v.trim().toUpperCase();
  }
  return null;
}

function vesselImo(obj: IntelligenceObject): string | null {
  if (obj.objectKind !== "vessel") return null;
  return getStr(obj.attributes as Fields, "imoNumber", "imo");
}

function vesselMmsi(obj: IntelligenceObject): string | null {
  if (obj.objectKind !== "vessel") return null;
  return getStr(obj.attributes as Fields, "mmsi");
}

function containerNum(obj: IntelligenceObject): string | null {
  if (obj.objectKind !== "container") return null;
  return getStr(obj.attributes as Fields, "containerNumber");
}

function bolRef(obj: IntelligenceObject): string | null {
  if (obj.objectKind !== "bill-of-lading") return null;
  return getStr(obj.attributes as Fields, "bolNumber", "documentNumber");
}

function companyReg(obj: IntelligenceObject): string | null {
  if (obj.objectKind !== "company") return null;
  return getStr(obj.attributes as Fields, "registrationNumber", "cacNumber");
}

function companyLei(obj: IntelligenceObject): string | null {
  if (obj.objectKind !== "company") return null;
  return getStr(obj.attributes as Fields, "leiCode", "lei");
}

function entityLabel(obj: IntelligenceObject): string {
  return obj.label ?? obj.objectId;
}

// ─── Candidate pair generation ───────────────────────────────────────

function extractsForKind(kind: IntelligenceObjectKind) {
  switch (kind) {
    case "vessel":          return [vesselImo, vesselMmsi] as const;
    case "container":       return [containerNum] as const;
    case "bill-of-lading":  return [bolRef] as const;
    case "company":         return [companyReg, companyLei] as const;
    default:                return [] as const;
  }
}

// ─── Core resolution ─────────────────────────────────────────────────

export function resolveEntities(
  registry: IntelligenceObjectRegistry,
  kinds: ReadonlyArray<IntelligenceObjectKind> = ["vessel", "company", "container", "bill-of-lading", "person"],
): EntityResolutionResult {
  const t0 = Date.now();
  const decisions: ResolutionDecision[] = [];
  const mergedIds = new Set<string>();  // ids already absorbed — skip in outer loop

  for (const kind of kinds) {
    const objects = registry.getByKind(kind as any);
    if (objects.length < 2) continue;

    // Build identifier index: value → objectId[]
    const identifierIndex = new Map<string, string[]>();

    for (const obj of objects) {
      if (mergedIds.has(obj.objectId)) continue;

      // Exact identifier signals
      const extractors = extractsForKind(kind);
      for (const extractor of extractors) {
        const val = (extractor as any)(obj);
        if (!val) continue;
        // Key format: `${kind}:${extractorName}:${value}`
        // We derive the field name from the extractor function name.
        const fieldName = (extractor as any).name ?? "id";
        const key = `${kind}:${fieldName}:${val}`;
        const existing = identifierIndex.get(key) ?? [];
        existing.push(obj.objectId);
        identifierIndex.set(key, existing);
      }
    }

    // Merge entities sharing an identifier
    for (const [key, ids] of identifierIndex) {
      if (ids.length < 2) continue;
      const [canonicalId, ...duplicates] = ids;

      for (const mergedId of duplicates) {
        if (mergedId === canonicalId || mergedIds.has(mergedId)) continue;

        const canonical = registry.get(canonicalId);
        const duplicate = registry.get(mergedId);
        if (!canonical || !duplicate) continue;

        const keyParts = key.split(":");
        const fieldName = keyParts[1] ?? "identifier";
        const value = keyParts.slice(2).join(":");
        const method = inferMethod(kind, key);
        const signal: ResolutionSignal = {
          method,
          field:   fieldName,
          valueA:  value,
          valueB:  value,
          score:   1.0,
        };

        const decision: ResolutionDecision = {
          canonicalId,
          mergedId,
          signals:    [signal],
          confidence: 1.0,
          method,
          decidedAt:  new Date().toISOString(),
          explanation:`${canonical.label} and ${duplicate.label} share identical ${method.replace(/-/g, " ")} "${value}"`,
        };

        // Merge duplicate into canonical in the registry
        registry.upsert({
          ...canonical,
          aliases:      dedupeStr([...canonical.aliases, mergedId, ...duplicate.aliases]),
          citations:    dedupeCit([...canonical.citations, ...duplicate.citations]),
          sourceUipIds: dedupeStr([...canonical.sourceUipIds, ...duplicate.sourceUipIds]),
          firstSeenAt:  earlier(canonical.firstSeenAt, duplicate.firstSeenAt),
          lastSeenAt:   later(canonical.lastSeenAt, duplicate.lastSeenAt),
          revision:     canonical.revision + 1,
        });

        decisions.push(decision);
        mergedIds.add(mergedId);
      }
    }

    // Name similarity pass for persons and companies (no hard identifier)
    if (kind === "person" || kind === "company") {
      const fresh = registry.getByKind(kind as any).filter((o: any) => !mergedIds.has(o.objectId));
      for (let i = 0; i < fresh.length - 1; i++) {
        const a = fresh[i];
        for (let j = i + 1; j < fresh.length; j++) {
          const b = fresh[j];
          if (mergedIds.has(a.objectId) || mergedIds.has(b.objectId)) continue;
          const sim = tokenSetSimilarity(entityLabel(a), entityLabel(b));
          if (sim < 0.85) continue;

          const signal: ResolutionSignal = {
            method: "name-similarity",
            field:  "label",
            valueA: entityLabel(a),
            valueB: entityLabel(b),
            score:  sim,
          };
          const decision: ResolutionDecision = {
            canonicalId: a.objectId,
            mergedId:    b.objectId,
            signals:     [signal],
            confidence:  sim,
            method:      "name-similarity",
            decidedAt:   new Date().toISOString(),
            explanation: `Name similarity ${(sim * 100).toFixed(0)}%: "${entityLabel(a)}" ≈ "${entityLabel(b)}"`,
          };
          registry.upsert({
            ...a,
            aliases:      dedupeStr([...a.aliases, b.objectId, ...b.aliases]),
            citations:    dedupeCit([...a.citations, ...b.citations]),
            sourceUipIds: dedupeStr([...a.sourceUipIds, ...b.sourceUipIds]),
            firstSeenAt:  earlier(a.firstSeenAt, b.firstSeenAt),
            lastSeenAt:   later(a.lastSeenAt, b.lastSeenAt),
            revision:     a.revision + 1,
          });
          decisions.push(decision);
          mergedIds.add(b.objectId);
        }
      }
    }
  }

  return {
    totalCandidates: registry.size,
    mergesPerformed: decisions.length,
    decisions,
    durationMs: Date.now() - t0,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────

function inferMethod(kind: string, key: string): ResolutionMethod {
  const field = key.split(":")[1] ?? "";
  if (field === "vesselImo"   || field.includes("imo"))               return "imo-match";
  if (field === "vesselMmsi"  || field.includes("mmsi"))              return "mmsi-match";
  if (field === "containerNum"|| field.includes("container"))         return "container-number-match";
  if (field === "bolRef"      || field.includes("bol") || field.includes("documentNumber")) return "bill-of-lading-match";
  if (field === "companyReg"  || field.includes("registration") || field.includes("cac")) return "company-registration-match";
  if (field === "companyLei"  || field.includes("lei"))               return "lei-match";
  return "name-similarity";
}

function dedupeStr(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function dedupeCit<T extends { evidenceId: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((c) => { if (seen.has(c.evidenceId)) return false; seen.add(c.evidenceId); return true; });
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a < b ? a : b;
}
function later(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a > b ? a : b;
}
