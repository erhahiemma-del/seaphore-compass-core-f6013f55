/**
 * MKG — Ingestion adapter.
 *
 * Consumes a `UnifiedIntelligencePackage` (the IFE terminal artefact) and
 * writes nodes + edges into a `MaritimeKnowledgeGraph`. Every field that
 * implies a relationship is projected as an edge; every unique entity
 * reference becomes a node. Nothing is fabricated.
 *
 * The ingester never inspects raw connector payloads — it reads the
 * fused canonical record + identity clusters + underlying evidence
 * records already normalised by the IAL.
 *
 * Deterministic. Idempotent — re-ingesting the same package strengthens
 * corroboration but never duplicates nodes or edges.
 */
import type {
  CanonicalEntityRef,
  ConnectorId,
  EvidenceGrade,
  NormalizedEvidence,
} from "@/services/ial/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { IdentityCluster } from "@/services/ife/identity-resolver";
import { MaritimeKnowledgeGraph } from "./graph";
import type { MkgEdgeType, MkgNodeKind, MkgProvenance } from "./types";

export interface IngestResult {
  readonly packageId: string;
  readonly nodesTouched: number;
  readonly edgesTouched: number;
}

export interface IngestOptions {
  /** Raw normalised evidence for this package. Optional — when provided,
   *  edges are minted from field-level references (ports called at,
   *  cargo carried, sanctions listings, etc). Without it, ingestion
   *  still writes one node per canonical entity + ALIAS_OF edges. */
  readonly evidence?: ReadonlyArray<NormalizedEvidence>;
}

const KIND_FROM_ID_PREFIX: Record<string, MkgNodeKind> = {
  vessel: "vessel",
  company: "company",
  person: "person",
  port: "port",
  cargo: "cargo",
  voyage: "voyage",
  manifest: "manifest",
  sanction: "sanction",
  inspection: "inspection",
  incident: "incident",
};

function kindFromId(id: string, fallback: MkgNodeKind): MkgNodeKind {
  const prefix = id.split(":", 1)[0]?.toLowerCase();
  return (prefix && KIND_FROM_ID_PREFIX[prefix]) || fallback;
}

function provenanceFrom(record: NormalizedEvidence): MkgProvenance {
  return {
    connectorId: record.source,
    sourceName: record.sourceName,
    evidenceId: record.id,
    observedAt: record.observedAt,
    grade: record.grade,
  };
}

/** Provenance without a specific evidence record — used for identity
 *  cluster edges (ALIAS_OF) derived from the resolver, and for canonical
 *  nodes when a package has no per-record evidence available. */
function syntheticProvenance(
  clusterOrPackageId: string,
  connectors: ReadonlyArray<ConnectorId>,
  grade: EvidenceGrade,
  observedAt: string,
): MkgProvenance {
  return {
    connectorId: connectors[0] ?? ("ife" as ConnectorId),
    sourceName: "IFE Identity Resolver",
    evidenceId: `ife-cluster:${clusterOrPackageId}`,
    observedAt,
    grade,
  };
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function upsertReferenceNode(
  graph: MaritimeKnowledgeGraph,
  id: string,
  kind: MkgNodeKind,
  label: string,
  attributes: Record<string, string | number | boolean>,
  provenance: MkgProvenance,
): void {
  graph.upsertNode({
    id,
    kind,
    label,
    attributes,
    provenance: [provenance],
  });
}

// Edge minting rules per evidence.kind ---------------------------------

function mintEdgesForRecord(graph: MaritimeKnowledgeGraph, record: NormalizedEvidence): number {
  const p = provenanceFrom(record);
  const from = record.entity.id;
  let edges = 0;
  const f = record.fields as Record<string, unknown>;

  const link = (
    toId: string,
    toKind: MkgNodeKind,
    toLabel: string,
    type: MkgEdgeType,
    explanation: string,
    attrs: Record<string, string | number | boolean> = {},
  ): void => {
    if (!toId || toId === from) return;
    upsertReferenceNode(graph, toId, toKind, toLabel, attrs, p);
    graph.upsertEdge({
      type,
      fromId: from,
      toId,
      explanation,
      provenance: [p],
    });
    edges += 1;
  };

  switch (record.kind) {
    case "ownership": {
      const ownerId = asString(f.ownerEntityId) ?? asString(f.ownerId);
      const ownerName = asString(f.ownerName) ?? asString(f.owner) ?? ownerId ?? "Unknown owner";
      if (ownerId) {
        link(
          ownerId,
          kindFromId(ownerId, "company"),
          ownerName,
          "OWNS",
          `${ownerName} recorded as beneficial owner of ${record.entity.label ?? from}`,
        );
      }
      const operatorId = asString(f.operatorEntityId) ?? asString(f.operatorId);
      const operatorName = asString(f.operatorName) ?? asString(f.operator) ?? operatorId;
      if (operatorId && operatorName) {
        link(
          operatorId,
          kindFromId(operatorId, "company"),
          operatorName,
          "OPERATES",
          `${operatorName} recorded as commercial operator`,
        );
      }
      const managerId = asString(f.managerEntityId) ?? asString(f.managerId);
      const managerName = asString(f.managerName) ?? asString(f.manager) ?? managerId;
      if (managerId && managerName) {
        link(
          managerId,
          kindFromId(managerId, "company"),
          managerName,
          "MANAGES",
          `${managerName} recorded as ship manager`,
        );
      }
      const flag = asString(f.flag) ?? asString(f.flagState);
      if (flag) {
        const flagId = `country:iso:${flag.toUpperCase()}`;
        link(flagId, "port", flag.toUpperCase(), "FLAGGED_BY", `Registered under flag ${flag}`, {
          iso: flag.toUpperCase(),
        });
      }
      break;
    }
    case "identity": {
      const flag = asString(f.flag) ?? asString(f.flagState);
      if (flag) {
        const flagId = `country:iso:${flag.toUpperCase()}`;
        link(
          flagId,
          "port",
          flag.toUpperCase(),
          "FLAGGED_BY",
          `Vessel identity records flag as ${flag}`,
          { iso: flag.toUpperCase() },
        );
      }
      break;
    }
    case "port-call": {
      const portId =
        (asString(f.portId) ?? asString(f.portUnlocode))
          ? `port:unlocode:${(asString(f.portUnlocode) ?? asString(f.portId))!.toUpperCase()}`
          : null;
      const portName = asString(f.portName) ?? asString(f.port) ?? portId ?? "Unknown port";
      if (portId) {
        link(portId, "port", portName, "CALLS_AT", `Port call at ${portName}`, {
          unlocode: portId.split(":").pop() ?? "",
        });
      }
      break;
    }
    case "voyage": {
      const voyageId = asString(f.voyageId) ?? `voyage:hash:${record.hash.slice(0, 12)}`;
      const voyageLabel = asString(f.voyageLabel) ?? asString(f.voyageNumber) ?? voyageId;
      link(
        voyageId,
        "voyage",
        voyageLabel,
        "PERFORMED_VOYAGE",
        `Vessel performed voyage ${voyageLabel}`,
      );
      const fromPort = asString(f.fromPort) ?? asString(f.originPort);
      const toPort = asString(f.toPort) ?? asString(f.destinationPort);
      if (fromPort) {
        const id = `port:unlocode:${fromPort.toUpperCase()}`;
        upsertReferenceNode(graph, id, "port", fromPort, { unlocode: fromPort.toUpperCase() }, p);
        graph.upsertEdge({
          type: "DEPARTED_FROM",
          fromId: voyageId,
          toId: id,
          explanation: `Voyage departed from ${fromPort}`,
          provenance: [p],
        });
        edges += 1;
      }
      if (toPort) {
        const id = `port:unlocode:${toPort.toUpperCase()}`;
        upsertReferenceNode(graph, id, "port", toPort, { unlocode: toPort.toUpperCase() }, p);
        graph.upsertEdge({
          type: "ARRIVED_AT",
          fromId: voyageId,
          toId: id,
          explanation: `Voyage arrived at ${toPort}`,
          provenance: [p],
        });
        edges += 1;
      }
      break;
    }
    case "cargo": {
      const cargoId = asString(f.cargoId) ?? `cargo:hash:${record.hash.slice(0, 12)}`;
      const cargoLabel = asString(f.cargoName) ?? asString(f.commodity) ?? cargoId;
      link(cargoId, "cargo", cargoLabel, "CARRIED", `Vessel carried ${cargoLabel}`, {
        tonnage: asNumber(f.tonnage) ?? 0,
      });
      const manifestId = asString(f.manifestId);
      if (manifestId) {
        const id = manifestId.startsWith("manifest:") ? manifestId : `manifest:${manifestId}`;
        upsertReferenceNode(graph, id, "manifest", asString(f.manifestNumber) ?? id, {}, p);
        graph.upsertEdge({
          type: "LISTED_ON_MANIFEST",
          fromId: cargoId,
          toId: id,
          explanation: `Cargo listed on manifest ${id}`,
          provenance: [p],
        });
        edges += 1;
      }
      const consigneeId = asString(f.consigneeEntityId);
      if (consigneeId) {
        link(
          consigneeId,
          kindFromId(consigneeId, "company"),
          asString(f.consigneeName) ?? consigneeId,
          "CONSIGNED_TO",
          `Cargo consigned to ${asString(f.consigneeName) ?? consigneeId}`,
        );
      }
      break;
    }
    case "sanctions": {
      const listName = asString(f.list) ?? asString(f.programme) ?? "Sanctions list";
      const listId = `sanction:${listName.replace(/\s+/g, "-").toLowerCase()}`;
      link(listId, "sanction", listName, "SANCTIONED_BY", `Subject listed on ${listName}`, {
        match: asString(f.match) ?? "listed",
      });
      break;
    }
    case "compliance": {
      const kind = asString(f.type) ?? "inspection";
      const inspId = `inspection:${record.hash.slice(0, 12)}`;
      link(
        inspId,
        "inspection",
        asString(f.title) ?? kind,
        "SUBJECT_OF_INSPECTION",
        `Subject of ${kind}`,
        {},
      );
      break;
    }
    case "position":
    case "weather":
    case "other":
    default:
      // No relational projection — the evidence still attaches to the
      // node's provenance below.
      break;
  }

  return edges;
}

function attributesFromClusterSignals(
  cluster: IdentityCluster,
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {};
  const s = cluster.signals;
  if (s.imo) attrs.imo = s.imo;
  if (s.mmsi) attrs.mmsi = s.mmsi;
  if (s.callSign) attrs.callSign = s.callSign;
  if (s.name) attrs.name = s.name;
  if (s.flag) attrs.flag = s.flag;
  if (cluster.confidence?.score !== undefined) {
    attrs.identityConfidenceScore = cluster.confidence.score;
  }
  return attrs;
}

/**
 * Ingest a Unified Intelligence Package. Writes one canonical node per
 * fused entity, alias edges for every identity cluster, and relationship
 * edges for every field-level reference in the supplied evidence.
 */
export function ingestUnifiedPackage(
  graph: MaritimeKnowledgeGraph,
  uip: UnifiedIntelligencePackage,
  options: IngestOptions = {},
): IngestResult {
  const evidence = options.evidence ?? [];
  const evidenceByEntity = new Map<string, NormalizedEvidence[]>();
  for (const r of evidence) {
    const arr = evidenceByEntity.get(r.entity.id) ?? [];
    arr.push(r);
    evidenceByEntity.set(r.entity.id, arr);
  }

  const touchedNodes = new Set<string>();
  let touchedEdges = 0;

  // Cluster index → canonical entity ref for label/kind fallback.
  const canonicalRefById = new Map<string, CanonicalEntityRef>();
  for (const rec of uip.fused.canonical) canonicalRefById.set(rec.entity.id, rec.entity);

  // 1. Canonical nodes + alias edges from identity clusters.
  for (const cluster of uip.identity) {
    const ref = canonicalRefById.get(cluster.canonicalId);
    const label = ref?.label ?? cluster.label ?? cluster.canonicalId;
    const kind: MkgNodeKind = ref?.kind ?? kindFromId(cluster.canonicalId, "vessel");
    const canonicalProv: MkgProvenance[] = (evidenceByEntity.get(cluster.canonicalId) ?? []).map(
      provenanceFrom,
    );
    if (canonicalProv.length === 0) {
      canonicalProv.push(syntheticProvenance(cluster.canonicalId, [], "REPORTED", uip.createdAt));
    }
    // Detect contradictions touching this entity in the fused package.
    const hasContradictions = uip.fused.contradictions.some(
      (c) => c.entity.id === cluster.canonicalId,
    );
    graph.upsertNode({
      id: cluster.canonicalId,
      kind,
      label,
      aliases: cluster.aliasIds,
      attributes: attributesFromClusterSignals(cluster),
      hasContradictions,
      provenance: canonicalProv,
    });
    touchedNodes.add(cluster.canonicalId);

    // Alias nodes + ALIAS_OF edges (dashed connections between id schemes).
    for (const aliasId of cluster.aliasIds) {
      if (aliasId === cluster.canonicalId) continue;
      const tier = cluster.confidence?.tier;
      const aliasProv = syntheticProvenance(
        cluster.canonicalId,
        [],
        tier === "VERIFIED" || tier === "OBSERVED" ? "CORROBORATED" : "REPORTED",
        uip.createdAt,
      );
      graph.upsertNode({
        id: aliasId,
        kind,
        label: aliasId,
        provenance: [aliasProv],
      });
      touchedNodes.add(aliasId);
      graph.upsertEdge({
        type: "ALIAS_OF",
        fromId: aliasId,
        toId: cluster.canonicalId,
        directed: true,
        explanation: `Identity resolver merged ${aliasId} into ${cluster.canonicalId} (score ${cluster.confidence?.score?.toFixed?.(2) ?? "n/a"})`,
        provenance: [aliasProv],
      });
      touchedEdges += 1;
    }
  }

  // 2. Fallback: any canonical fused record without a cluster entry.
  for (const rec of uip.fused.canonical) {
    if (touchedNodes.has(rec.entity.id)) continue;
    const provs = (evidenceByEntity.get(rec.entity.id) ?? []).map(provenanceFrom);
    graph.upsertNode({
      id: rec.entity.id,
      kind: rec.entity.kind as MkgNodeKind,
      label: rec.entity.label ?? rec.entity.id,
      provenance: provs.length
        ? provs
        : [syntheticProvenance(uip.id, [], "REPORTED", uip.createdAt)],
      hasContradictions: uip.fused.contradictions.some((c) => c.entity.id === rec.entity.id),
    });
    touchedNodes.add(rec.entity.id);
  }

  // 3. Mint relationship edges from every supplied evidence record.
  for (const record of evidence) {
    // Ensure the primary entity node exists even if the IFE cluster set
    // did not enumerate it (defensive — safe against sparse packages).
    if (!graph.getNode(record.entity.id)) {
      graph.upsertNode({
        id: record.entity.id,
        kind: record.entity.kind as MkgNodeKind,
        label: record.entity.label ?? record.entity.id,
        provenance: [provenanceFrom(record)],
      });
      touchedNodes.add(record.entity.id);
    }
    touchedEdges += mintEdgesForRecord(graph, record);
  }

  return {
    packageId: uip.id,
    nodesTouched: touchedNodes.size,
    edgesTouched: touchedEdges,
  };
}
