/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A — MIC · Eight Registries
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Each registry is a typed, read-optimised in-memory store for one
 *  class of MIC intelligence. All registries are:
 *    • Append-only by id — upsert never deletes.
 *    • Revision-tracked — revision bumped on every write.
 *    • Evidence-linked — every entry carries citations.
 *    • Queryable without a database — pure Map operations.
 *
 *  The registries are NOT Zustand stores — they are plain classes that
 *  the MicContainer (factory) owns. This makes them testable without
 *  React and embeddable in server functions.
 * ─────────────────────────────────────────────────────────────────────
 */
import type {
  MicConfidenceRegistryEntry,
  MicEntityRegistryEntry,
  MicEvidenceRegistryEntry,
  MicGraphRegistryEntry,
  MicReasoningRegistryEntry,
  MicRelationshipRegistryEntry,
  MicRiskRegistryEntry,
  MicTimelineEvent,
  MicTimelineEventKind,
  MkgNode,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
//  BASE REGISTRY
// ─────────────────────────────────────────────────────────────────────

abstract class BaseRegistry<T extends { id: string; revision: number }> {
  protected readonly store = new Map<string, T>();
  private _totalRevisions = 0;

  /** Upsert: if id exists, apply merger; otherwise insert. */
  protected upsert(id: string, entry: T): T {
    this.store.set(id, entry);
    this._totalRevisions++;
    return entry;
  }

  get(id: string): T | undefined {
    return this.store.get(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  getAll(): ReadonlyArray<T> {
    return Array.from(this.store.values());
  }

  get size(): number {
    return this.store.size;
  }

  get totalRevisions(): number {
    return this._totalRevisions;
  }

  clear(): void {
    this.store.clear();
    this._totalRevisions = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  1. ENTITY REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicEntityRegistry extends BaseRegistry<MicEntityRegistryEntry> {
  private readonly byKind = new Map<string, Set<string>>();
  private readonly byAlias = new Map<string, string>(); // alias → canonical id

  register(entry: Omit<MicEntityRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicEntityRegistryEntry {
    const existing = this.store.get(entry.canonicalId);
    const now = new Date().toISOString();
    const revision = (existing?.revision ?? 0) + 1;

    const merged: MicEntityRegistryEntry = existing
      ? {
          ...existing,
          label: entry.label,
          aliases: dedupe([...existing.aliases, ...entry.aliases]),
          confidence: entry.confidence,
          grade: entry.grade,
          citations: dedupe([...existing.citations, ...entry.citations], (c) => c.evidenceId),
          sourceUipIds: dedupe([...existing.sourceUipIds, ...entry.sourceUipIds]),
          lastUpdatedAt: now,
          revision,
        }
      : {
          id: entry.canonicalId,
          ...entry,
          registeredAt: now,
          lastUpdatedAt: now,
          revision,
        };

    this.upsert(entry.canonicalId, merged);

    // Index by kind
    const kindSet = this.byKind.get(entry.kind) ?? new Set<string>();
    kindSet.add(entry.canonicalId);
    this.byKind.set(entry.kind, kindSet);

    // Index aliases → canonical
    for (const alias of merged.aliases) {
      this.byAlias.set(alias, entry.canonicalId);
    }

    return merged;
  }

  resolveAlias(aliasId: string): string | undefined {
    return this.byAlias.get(aliasId) ?? (this.store.has(aliasId) ? aliasId : undefined);
  }

  getByKind(kind: MkgNode["kind"]): ReadonlyArray<MicEntityRegistryEntry> {
    const ids = this.byKind.get(kind);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.store.get(id)!)
      .filter(Boolean);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  2. RELATIONSHIP REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicRelationshipRegistry extends BaseRegistry<MicRelationshipRegistryEntry> {
  private readonly byEntity = new Map<string, Set<string>>(); // entityId → edgeIds

  register(
    entry: Omit<MicRelationshipRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">,
  ): MicRelationshipRegistryEntry {
    const existing = this.store.get(entry.edgeId);
    const now = new Date().toISOString();
    const revision = (existing?.revision ?? 0) + 1;

    const merged: MicRelationshipRegistryEntry = existing
      ? {
          ...existing,
          confidence: entry.confidence,
          grade: entry.grade,
          citations: dedupe([...existing.citations, ...entry.citations], (c) => c.evidenceId),
          explanation: entry.explanation,
          lastUpdatedAt: now,
          revision,
        }
      : {
          id: entry.edgeId,
          ...entry,
          registeredAt: now,
          lastUpdatedAt: now,
          revision,
        };

    this.upsert(entry.edgeId, merged);

    for (const entityId of [entry.fromEntityId, entry.toEntityId]) {
      const set = this.byEntity.get(entityId) ?? new Set<string>();
      set.add(entry.edgeId);
      this.byEntity.set(entityId, set);
    }

    return merged;
  }

  getForEntity(entityId: string): ReadonlyArray<MicRelationshipRegistryEntry> {
    const ids = this.byEntity.get(entityId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.store.get(id)!)
      .filter(Boolean);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  3. EVIDENCE REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicEvidenceRegistry extends BaseRegistry<MicEvidenceRegistryEntry> {
  private readonly byEntity = new Map<string, Set<string>>();
  private readonly byUip = new Map<string, Set<string>>();
  private readonly byConnector = new Map<string, Set<string>>();

  register(entry: Omit<MicEvidenceRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicEvidenceRegistryEntry {
    if (this.store.has(entry.evidenceId)) {
      return this.store.get(entry.evidenceId)!;
    }
    const now = new Date().toISOString();
    const rec: MicEvidenceRegistryEntry = {
      id: entry.evidenceId,
      ...entry,
      registeredAt: now,
      lastUpdatedAt: now,
      revision: 1,
    };
    this.upsert(entry.evidenceId, rec);

    indexInto(this.byEntity, entry.entityId, entry.evidenceId);
    indexInto(this.byUip, entry.uipId, entry.evidenceId);
    indexInto(this.byConnector, entry.connectorId, entry.evidenceId);

    return rec;
  }

  getForEntity(entityId: string): ReadonlyArray<MicEvidenceRegistryEntry> {
    return idsToEntries(this.byEntity, entityId, this.store);
  }

  getForUip(uipId: string): ReadonlyArray<MicEvidenceRegistryEntry> {
    return idsToEntries(this.byUip, uipId, this.store);
  }

  getForConnector(connectorId: string): ReadonlyArray<MicEvidenceRegistryEntry> {
    return idsToEntries(this.byConnector, connectorId, this.store);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  4. CONFIDENCE REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicConfidenceRegistry extends BaseRegistry<MicConfidenceRegistryEntry> {
  register(entry: Omit<MicConfidenceRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicConfidenceRegistryEntry {
    const id = `${entry.subjectKind}:${entry.subjectId}`;
    const now = new Date().toISOString();
    const existing = this.store.get(id);
    const revision = (existing?.revision ?? 0) + 1;

    const rec: MicConfidenceRegistryEntry = {
      id,
      ...entry,
      registeredAt: existing?.registeredAt ?? now,
      lastUpdatedAt: now,
      revision,
    };
    return this.upsert(id, rec);
  }

  getForSubject(
    kind: MicConfidenceRegistryEntry["subjectKind"],
    subjectId: string,
  ): MicConfidenceRegistryEntry | undefined {
    return this.store.get(`${kind}:${subjectId}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  5. TIMELINE REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicTimelineRegistry extends BaseRegistry<MicTimelineEvent> {
  private readonly byEntity = new Map<string, Set<string>>();

  register(entry: Omit<MicTimelineEvent, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicTimelineEvent {
    // Derive a stable id from entity + kind + occurredAt so duplicate
    // ingestion of the same event doesn't create duplicate entries.
    const stableId = `tl:${entry.entityId}:${entry.kind}:${entry.occurredAt}`;
    if (this.store.has(stableId)) return this.store.get(stableId)!;

    const now = new Date().toISOString();
    const ev: MicTimelineEvent = {
      id: stableId,
      ...entry,
      registeredAt: now,
      lastUpdatedAt: now,
      revision: 1,
    };
    this.upsert(stableId, ev);
    indexInto(this.byEntity, entry.entityId, stableId);
    return ev;
  }

  getForEntity(entityId: string): ReadonlyArray<MicTimelineEvent> {
    return idsToEntries(this.byEntity, entityId, this.store)
      .slice()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  getByKind(kind: MicTimelineEventKind): ReadonlyArray<MicTimelineEvent> {
    return this.getAll().filter((e) => e.kind === kind);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  6. GRAPH REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicGraphRegistry extends BaseRegistry<MicGraphRegistryEntry> {
  register(entry: Omit<MicGraphRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicGraphRegistryEntry {
    const now = new Date().toISOString();
    const existing = this.store.get(entry.uipId);
    const revision = (existing?.revision ?? 0) + 1;
    const rec: MicGraphRegistryEntry = {
      id: entry.uipId,
      ...entry,
      registeredAt: existing?.registeredAt ?? now,
      lastUpdatedAt: now,
      revision,
    };
    return this.upsert(entry.uipId, rec);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  7. RISK REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicRiskRegistry extends BaseRegistry<MicRiskRegistryEntry> {
  private readonly byBand = new Map<string, Set<string>>();

  register(entry: Omit<MicRiskRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicRiskRegistryEntry {
    const id = `risk:${entry.entityId}`;
    const now = new Date().toISOString();
    const existing = this.store.get(id);
    const revision = (existing?.revision ?? 0) + 1;
    const rec: MicRiskRegistryEntry = {
      id,
      ...entry,
      registeredAt: existing?.registeredAt ?? now,
      lastUpdatedAt: now,
      revision,
    };
    this.upsert(id, rec);
    indexInto(this.byBand, entry.band, id);
    return rec;
  }

  getForEntity(entityId: string): MicRiskRegistryEntry | undefined {
    return this.store.get(`risk:${entityId}`);
  }

  getByBand(band: MicRiskRegistryEntry["band"]): ReadonlyArray<MicRiskRegistryEntry> {
    return idsToEntries(this.byBand, band, this.store);
  }

  getCritical(): ReadonlyArray<MicRiskRegistryEntry> {
    return this.getByBand("critical");
  }
}

// ─────────────────────────────────────────────────────────────────────
//  8. REASONING REGISTRY
// ─────────────────────────────────────────────────────────────────────

export class MicReasoningRegistry extends BaseRegistry<MicReasoningRegistryEntry> {
  private readonly bySession = new Map<string, Set<string>>();
  private readonly byEntity = new Map<string, Set<string>>();

  register(entry: Omit<MicReasoningRegistryEntry, "id" | "revision" | "registeredAt" | "lastUpdatedAt">): MicReasoningRegistryEntry {
    const id = `reasoning:${entry.sessionId}:${entry.uipId}`;
    const now = new Date().toISOString();
    const existing = this.store.get(id);
    const revision = (existing?.revision ?? 0) + 1;
    const rec: MicReasoningRegistryEntry = {
      id,
      ...entry,
      registeredAt: existing?.registeredAt ?? now,
      lastUpdatedAt: now,
      revision,
    };
    this.upsert(id, rec);
    indexInto(this.bySession, entry.sessionId, id);
    if (entry.primaryEntityId) {
      indexInto(this.byEntity, entry.primaryEntityId, id);
    }
    return rec;
  }

  getForSession(sessionId: string): ReadonlyArray<MicReasoningRegistryEntry> {
    return idsToEntries(this.bySession, sessionId, this.store);
  }

  getForEntity(entityId: string): ReadonlyArray<MicReasoningRegistryEntry> {
    return idsToEntries(this.byEntity, entityId, this.store);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────────

function dedupe<T>(arr: ReadonlyArray<T>, key?: (t: T) => unknown): T[] {
  if (!key) {
    return Array.from(new Set(arr));
  }
  const seen = new Set<unknown>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function indexInto(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function idsToEntries<T extends { id: string }>(
  index: Map<string, Set<string>>,
  key: string,
  store: Map<string, T>,
): T[] {
  const ids = index.get(key);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => store.get(id)!)
    .filter(Boolean);
}
