/**
 * Evidence Normalizer — coerces provider records into the Seaphore
 * evidence model. Providers do their own field-map in `connector.normalize`;
 * this module handles cross-cutting concerns: canonical ids, IMO/UN-LOCODE
 * formatting, timestamp normalisation, freshness, and hashing.
 */
import type {
  CanonicalEntityRef,
  ConnectorId,
  EntityKind,
  EvidenceFieldValue,
  EvidenceGrade,
  NormalizedEvidence,
} from "./types";
import { stableHash } from "./hash";

export interface NormalizerInput {
  readonly source: ConnectorId;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;
  readonly entity: { kind: EntityKind; nativeId: string; label?: string };
  readonly kind: NormalizedEvidence["kind"];
  readonly fields: Record<string, EvidenceFieldValue>;
  readonly observedAt: string | Date;
  readonly providerRecordId?: string;
  readonly excerpt?: string;
  readonly units?: Record<string, string>;
}

const NOW = () => new Date().toISOString();

export function canonicalEntityId(kind: EntityKind, nativeId: string): string {
  const trimmed = String(nativeId ?? "").trim();
  if (!trimmed) return `${kind}:unknown`;
  if (kind === "vessel") {
    const imo = trimmed.replace(/[^0-9]/g, "");
    if (imo.length === 7) return `vessel:imo:${imo}`;
    return `vessel:name:${slug(trimmed)}`;
  }
  if (kind === "port") {
    if (/^[A-Z]{5}$/i.test(trimmed)) return `port:unlocode:${trimmed.toUpperCase()}`;
    return `port:name:${slug(trimmed)}`;
  }
  return `${kind}:${slug(trimmed)}`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeRecord(input: NormalizerInput): NormalizedEvidence {
  const entity: CanonicalEntityRef = {
    kind: input.entity.kind,
    id: canonicalEntityId(input.entity.kind, input.entity.nativeId),
    label: input.entity.label,
  };
  const observedAt =
    input.observedAt instanceof Date
      ? input.observedAt.toISOString()
      : new Date(input.observedAt).toISOString();
  const retrievedAt = NOW();
  const freshnessSeconds = Math.max(
    0,
    Math.round((Date.parse(retrievedAt) - Date.parse(observedAt)) / 1000),
  );
  const hashCore = { entity: entity.id, kind: input.kind, fields: input.fields };
  const hash = stableHash(hashCore);
  const id = `ev_${input.source}_${hash}`;
  return {
    id,
    source: input.source,
    sourceName: input.sourceName,
    grade: input.grade,
    entity,
    kind: input.kind,
    fields: Object.freeze({ ...input.fields }),
    observedAt,
    retrievedAt,
    freshnessSeconds,
    hash,
    providerRecordId: input.providerRecordId,
    excerpt: input.excerpt,
    units: input.units ? Object.freeze({ ...input.units }) : undefined,
  };
}
