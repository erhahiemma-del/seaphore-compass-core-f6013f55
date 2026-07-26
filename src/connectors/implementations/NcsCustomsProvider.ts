/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT EP-CARGO-01 — Nigeria Customs Service Declarations
 *  The first certified CAPABILITY.CARGO Evidence Provider.
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Wave 1 / P0 of the CAPABILITY.CARGO v1.0 Provider Strategy: the
 *  customs authority of record. It is the only candidate that can grade
 *  cargo evidence `VERIFIED` and therefore the only one that makes
 *  revenue-leakage findings actionable.
 *
 *  Architecture position (frozen pipeline — unchanged by this file):
 *    Officer Query → IAL → NcsCustomsProvider → EvidencePackage → IFE
 *      → Canonical UIP → Workspace → OKL → OIE → MIBC
 *
 *  HONESTY NOTE — NICIS II / the NCS trade portal is a credentialed
 *  government system with no public API. With no endpoint or token
 *  configured this provider reports an explicit acquisition failure and
 *  the dashboard shows "Awaiting Credentials". It never simulates a
 *  declaration, a duty figure or a container move.
 *
 *  Never: persists, resolves identity, dedupes, scores risk, publishes a
 *  UIP, or modifies IAL / IFE / OIE / OKL / MIBC / the Connector
 *  Framework. It imports no Supabase client and writes nothing anywhere.
 * ─────────────────────────────────────────────────────────────────────
 */
import { BaseEvidenceProvider } from "@/connectors/framework/BaseEvidenceProvider";
import type { ProviderValidation } from "@/connectors/framework/spec";
import type { EvidenceCache } from "@/services/ial/cache";
import { stableHash } from "@/services/ial/hash";
import { normalizeRecord } from "@/services/ial/normalizer";
import { validateRecords } from "@/services/ial/validator";
import type { ConnectorCapability } from "@/services/ial/connectors/base";
import type { ProviderMetadata } from "@/services/ial/connectors/provider-metadata";
import type {
  AcquisitionQuery,
  ConnectorId,
  ConnectorResult,
  EvidenceFieldValue,
  NormalizedEvidence,
  ValidationIssue,
} from "@/services/ial/types";
import {
  readFirstProviderCredential,
  readProviderCredential,
  timedFetch,
  type ProviderOptions,
} from "./shared/provider-io";

/** Deployment-supplied base URL — no default endpoint is guessed. */
const BASE_URL_ENV = ["NCS_CUSTOMS_API_BASE_URL", "NCS_TRADE_PORTAL_BASE_URL"] as const;
const TOKEN_ENV = ["NCS_CUSTOMS_API_TOKEN", "NCS_TRADE_PORTAL_API_KEY"] as const;
const DECLARATIONS_PATH = "/declarations/search";
const HEALTH_PATH = "/health";
const TIMEOUT_MS = 10_000;

/** Declarations are authority-of-record and change slowly once lodged. */
export const NCS_CUSTOMS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export const NCS_CUSTOMS_METADATA: ProviderMetadata = {
  providerType: "LIVE",
  /** Authority of record — highest priority of any CARGO provider. */
  priority: 100,
  environment: "both",
  enabled: true,
};

/* ─── Provider-native shapes (only the fields this provider consumes) ── */

export interface NcsContainer {
  containerNumber?: string;
  isoType?: string;
  sizeFt?: number;
  status?: "full" | "empty";
  sealNumber?: string;
  gateInAt?: string;
  gateOutAt?: string;
  terminal?: string;
}

export interface NcsCargoItem {
  lineNumber?: number;
  description?: string;
  hsCode?: string;
  packages?: number;
  grossWeightKg?: number;
  netWeightKg?: number;
  volumeM3?: number;
  marks?: string;
  containerNumber?: string;
  declaredValue?: number;
  currency?: string;
}

export interface NcsDeclaration {
  sadNumber?: string;
  regime?: string;
  office?: string;
  status?: string;
  lodgedAt?: string;
  releasedAt?: string;
  inspection?: string;
  manifestNumber?: string;
  manifestType?: "import" | "export" | "transhipment";
  manifestLodgedAt?: string;
  manifestLineCount?: number;
  manifestStatus?: string;
  bolNumber?: string;
  bolType?: "master" | "house";
  bolIssuedAt?: string;
  placeOfReceipt?: string;
  placeOfDelivery?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  vesselImo?: string;
  vesselName?: string;
  voyageNumber?: string;
  shipperName?: string;
  shipperRcNumber?: string;
  consigneeName?: string;
  consigneeRcNumber?: string;
  carrierName?: string;
  declarantRcNumber?: string;
  declaredValue?: number;
  cifValue?: number;
  currency?: string;
  dutyRate?: number;
  dutyAssessed?: number;
  dutyPaid?: number;
  exemptionCode?: string;
  containers?: NcsContainer[];
  items?: NcsCargoItem[];
  updatedAt?: string;
}

/* ─── Internal utilities (declared INTERNAL ONLY in the contract) ────── */

/** ISO 6346 check-digit verification. Pure; flags, never rewrites. */
export function isValidContainerNumber(value: string): boolean {
  const s = value.trim().toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(s)) return false;
  const letterValue = (ch: string): number => {
    const n = ch.charCodeAt(0) - 55; // A = 10
    // 11, 22, 33 are skipped in ISO 6346.
    return n + Math.floor((n - 10) / 10) + (n >= 11 ? 0 : 0) === 0 ? n : n + Math.floor((n - 10) / 10);
  };
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = s[i];
    const v = /[A-Z]/.test(ch) ? letterValue(ch) : Number(ch);
    sum += v * 2 ** i;
  }
  return (sum % 11) % 10 === Number(s[10]);
}

/** HS code normalisation to the dotted 6-digit form. INTERNAL ONLY. */
export function normaliseHsCode(value: string | undefined | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const six = digits.slice(0, 6).padEnd(6, "0");
  return `${six.slice(0, 4)}.${six.slice(4, 6)}`;
}

const cargoId = (suffix: string): string => `cargo:${suffix}`;
const companyId = (rc: string | undefined, name: string | undefined): string | null => {
  if (rc) return `company:cac:${rc.trim().toUpperCase()}`;
  if (name) return `company:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64)}`;
  return null;
};

/**
 * `normalizeRecord` slugs canonical ids, which would flatten the cargo
 * namespace (`cargo:manifest:MF-1` → `cargo:manifest-mf-1`) and lose the
 * sub-type the Cargo Knowledge Graph reads. The frozen normalizer is not
 * modified; the provider restores the namespaced id on its own record.
 */
function withCanonicalId(record: NormalizedEvidence, id: string): NormalizedEvidence {
  return { ...record, entity: { ...record.entity, id } };
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export class NcsCustomsProvider extends BaseEvidenceProvider {
  readonly id: ConnectorId = "customs";
  readonly displayName = "Nigeria Customs Service — Declarations";
  readonly provider: ProviderMetadata = NCS_CUSTOMS_METADATA;
  readonly projectionContractId = "capability.cargo";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = ["CARGO", "COMPLIANCE"];

  private readonly fetchImpl: typeof fetch;
  private readonly token: string | null;
  private readonly baseUrl: string | null;

  constructor(opts: ProviderOptions & { baseUrl?: string | null } = {}) {
    super({
      cache: opts.cache,
      clock: opts.clock,
      cacheTtlMs: opts.cacheTtlMs ?? NCS_CUSTOMS_CACHE_TTL_MS,
    });
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.token = opts.credential ?? readFirstProviderCredential(TOKEN_ENV)?.value ?? null;
    this.baseUrl =
      opts.baseUrl ??
      BASE_URL_ENV.map((n) => readProviderCredential(n)).find((v) => !!v)?.value ??
      null;
  }

  protected cacheKey(query: AcquisitionQuery): string {
    return `${this.id}:${stableHash({ text: query.text, entity: query.entity?.id })}`;
  }

  async connect(): Promise<void> {
    if (!this.baseUrl) {
      this.available = false;
      this.lastError =
        "NCS declarations endpoint not configured (NCS_CUSTOMS_API_BASE_URL) — no cargo evidence can be acquired";
      this.authed = false;
      return;
    }
    try {
      const res = await timedFetch(this.fetchImpl, `${this.baseUrl}${HEALTH_PATH}`, TIMEOUT_MS);
      this.available = res.status < 500;
      this.lastError = this.available ? null : `health probe returned ${res.status}`;
    } catch (err) {
      this.available = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.authed = await this.authenticate();
  }

  async authenticate(): Promise<boolean> {
    this.authed = this.token !== null && this.baseUrl !== null;
    if (!this.authed) {
      this.lastError = this.baseUrl
        ? "NCS declarations API token not configured (NCS_CUSTOMS_API_TOKEN)"
        : "NCS declarations endpoint not configured (NCS_CUSTOMS_API_BASE_URL)";
    }
    return this.authed;
  }

  protected async fetchEvidence(
    query: AcquisitionQuery,
  ): Promise<ReadonlyArray<NormalizedEvidence>> {
    if (!(await this.authenticate())) {
      throw new Error(
        `${this.lastError} — no customs evidence acquired (evidence is never simulated)`,
      );
    }
    const term = (query.entity?.label ?? query.text ?? "").trim();
    if (!term) return [];

    const url = new URL(`${this.baseUrl}${DECLARATIONS_PATH}`);
    url.searchParams.set("q", term);
    const res = await timedFetch(this.fetchImpl, url.toString(), TIMEOUT_MS, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`NCS declarations API rejected the configured token (${res.status})`);
    }
    if (res.status === 429) throw new Error("NCS declarations API rate limited (429)");
    if (res.status !== 200) throw new Error(`NCS declarations API returned ${res.status}`);

    const payload = (await res.json()) as { declarations?: NcsDeclaration[] };
    const out: NormalizedEvidence[] = [];
    for (const declaration of payload.declarations ?? []) {
      out.push(...this.expand(declaration, query));
    }
    return out;
  }

  /**
   * One declaration expands into the evidenced cargo chain: declaration,
   * manifest, bill of lading, containers, cargo items and — only when the
   * authority actually assessed duty — a revenue assessment.
   */
  private expand(
    declaration: NcsDeclaration,
    query: AcquisitionQuery,
  ): NormalizedEvidence[] {
    const out: NormalizedEvidence[] = [];
    const head = this.normalize(declaration, query);
    if (!head) return out;
    out.push(head);

    const sad = declaration.sadNumber?.trim();
    const bol = declaration.bolNumber?.trim();
    const manifest = declaration.manifestNumber?.trim();
    const observedAt = declaration.updatedAt ?? declaration.lodgedAt ?? new Date().toISOString();

    if (manifest) {
      out.push(
        withCanonicalId(
          normalizeRecord({
            source: this.id,
            sourceName: this.displayName,
            grade: "VERIFIED",
            entity: { kind: "cargo", nativeId: `manifest-${manifest}`, label: manifest },
            kind: "cargo",
            fields: {
              "manifest.number": manifest,
              "manifest.type": declaration.manifestType ?? null,
              "manifest.lodgedAt": declaration.manifestLodgedAt ?? null,
              "manifest.lineCount": declaration.manifestLineCount ?? null,
              "manifest.status": declaration.manifestStatus ?? null,
              "rel.vessel": declaration.vesselImo
                ? `vessel:imo:${declaration.vesselImo.replace(/\D/g, "")}`
                : null,
              "rel.voyage": declaration.voyageNumber ? `voyage:${declaration.voyageNumber}` : null,
              "rel.portOfLoading": portRef(declaration.portOfLoading),
              "rel.portOfDischarge": portRef(declaration.portOfDischarge),
              "rel.carrier": companyId(undefined, declaration.carrierName),
              rawHash: stableHash({ manifest, sad }),
            },
            observedAt: declaration.manifestLodgedAt ?? observedAt,
            providerRecordId: manifest,
            excerpt: `Manifest ${manifest} lodged with NCS`,
          }),
          cargoId(`manifest:NCS:${manifest}`),
        ),
      );
    }

    if (bol) {
      out.push(
        withCanonicalId(
          normalizeRecord({
            source: this.id,
            sourceName: this.displayName,
            grade: "VERIFIED",
            entity: { kind: "cargo", nativeId: `bol-${bol}`, label: bol },
            kind: "cargo",
            fields: {
              "bol.number": bol,
              "bol.type": declaration.bolType ?? null,
              "bol.issuedAt": declaration.bolIssuedAt ?? null,
              "bol.placeOfReceipt": declaration.placeOfReceipt ?? null,
              "bol.placeOfDelivery": declaration.placeOfDelivery ?? null,
              "rel.manifest": manifest ? cargoId(`manifest:NCS:${manifest}`) : null,
              "rel.shipper": companyId(declaration.shipperRcNumber, declaration.shipperName),
              "rel.consignee": companyId(declaration.consigneeRcNumber, declaration.consigneeName),
              "rel.carrier": companyId(undefined, declaration.carrierName),
              rawHash: stableHash({ bol, sad }),
            },
            observedAt: declaration.bolIssuedAt ?? observedAt,
            providerRecordId: bol,
            excerpt: `Bill of Lading ${bol}`,
          }),
          cargoId(`bol:NCS:${bol}`),
        ),
      );
    }

    for (const c of declaration.containers ?? []) {
      const number = c.containerNumber?.trim().toUpperCase();
      if (!number) continue;
      out.push(
        withCanonicalId(
          normalizeRecord({
            source: this.id,
            sourceName: this.displayName,
            grade: "VERIFIED",
            entity: { kind: "cargo", nativeId: `container-${number}`, label: number },
            kind: c.gateInAt || c.gateOutAt ? "port-call" : "cargo",
            fields: {
              "container.number": number,
              "container.isoType": c.isoType ?? null,
              "container.sizeFt": c.sizeFt ?? null,
              "container.status": c.status ?? null,
              "container.sealNumber": c.sealNumber ?? null,
              "container.gateInAt": c.gateInAt ?? null,
              "container.gateOutAt": c.gateOutAt ?? null,
              "container.terminal": c.terminal ?? null,
              "container.checkDigitValid": isValidContainerNumber(number),
              "rel.bol": bol ? cargoId(`bol:NCS:${bol}`) : null,
              "rel.portOfDischarge": portRef(declaration.portOfDischarge),
              rawHash: stableHash(c),
            },
            observedAt: c.gateOutAt ?? c.gateInAt ?? observedAt,
            providerRecordId: number,
            excerpt: `Container ${number}${c.terminal ? ` at ${c.terminal}` : ""}`,
          }),
          cargoId(`container:${number}`),
        ),
      );
    }

    for (const item of declaration.items ?? []) {
      const line = item.lineNumber ?? (declaration.items ?? []).indexOf(item) + 1;
      const key = `${bol ?? sad ?? "line"}:${line}`;
      const hs = normaliseHsCode(item.hsCode);
      out.push(
        withCanonicalId(
          normalizeRecord({
            source: this.id,
            sourceName: this.displayName,
            grade: "VERIFIED",
            entity: {
              kind: "cargo",
              nativeId: `item-${key}`,
              label: item.description ?? `Line ${line}`,
            },
            kind: "cargo",
            fields: {
              "cargo.description": item.description ?? null,
              "cargo.hsCode": hs,
              "cargo.packages": item.packages ?? null,
              "cargo.grossWeightKg": item.grossWeightKg ?? null,
              "cargo.netWeightKg": item.netWeightKg ?? null,
              "cargo.volumeM3": item.volumeM3 ?? null,
              "cargo.marks": item.marks ?? null,
              "value.declared": item.declaredValue ?? null,
              "value.currency": item.currency ?? declaration.currency ?? null,
              "rel.container": item.containerNumber
                ? cargoId(`container:${item.containerNumber.trim().toUpperCase()}`)
                : null,
              "rel.bol": bol ? cargoId(`bol:NCS:${bol}`) : null,
              rawHash: stableHash(item),
            },
            observedAt,
            providerRecordId: key,
            excerpt: `${item.description ?? "Cargo line"}${hs ? ` · HS ${hs}` : ""}`,
            units: {
              grossWeightKg: "kg",
              netWeightKg: "kg",
              volumeM3: "m3",
              declaredValue: item.currency ?? declaration.currency ?? "NGN",
            },
          }),
          cargoId(`item:${key}`),
        ),
      );
    }

    // A revenue assessment exists only when the authority assessed duty.
    if (sad && (declaration.dutyAssessed != null || declaration.dutyPaid != null)) {
      out.push(
        withCanonicalId(
          normalizeRecord({
            source: this.id,
            sourceName: this.displayName,
            grade: "VERIFIED",
            entity: { kind: "cargo", nativeId: `assessment-${sad}`, label: `Assessment ${sad}` },
            kind: "compliance",
            fields: {
              "customs.sadNumber": sad,
              "value.cif": declaration.cifValue ?? null,
              "value.declared": declaration.declaredValue ?? null,
              "value.currency": declaration.currency ?? null,
              "duty.rate": declaration.dutyRate ?? null,
              "duty.assessed": declaration.dutyAssessed ?? null,
              "duty.paid": declaration.dutyPaid ?? null,
              "duty.exemptionCode": declaration.exemptionCode ?? null,
              "rel.declaration": cargoId(`declaration:NCS:${sad}`),
              rawHash: stableHash({ sad, duty: declaration.dutyAssessed }),
            },
            observedAt,
            providerRecordId: `${sad}:assessment`,
            excerpt: `Duty assessment for SAD ${sad}`,
            units: {
              declaredValue: declaration.currency ?? "NGN",
              cifValue: declaration.currency ?? "NGN",
              dutyAssessed: declaration.currency ?? "NGN",
              dutyPaid: declaration.currency ?? "NGN",
            },
          }),
          cargoId(`assessment:NCS:${sad}`),
        ),
      );
    }

    return out;
  }

  /** Declaration head record. Public per the frozen provider API. */
  normalize(raw: unknown, _query: AcquisitionQuery): NormalizedEvidence | null {
    const d = raw as NcsDeclaration | null | undefined;
    const sad = d?.sadNumber?.trim();
    if (!d || !sad) return null;

    const fields: Record<string, EvidenceFieldValue> = {
      "customs.sadNumber": sad,
      "customs.regime": d.regime ?? null,
      "customs.office": d.office ?? null,
      "customs.status": d.status ?? null,
      "customs.releasedAt": d.releasedAt ?? null,
      "customs.inspection": d.inspection ?? null,
      "manifest.number": d.manifestNumber ?? null,
      "bol.number": d.bolNumber ?? null,
      "value.declared": d.declaredValue ?? null,
      "value.cif": d.cifValue ?? null,
      "value.currency": d.currency ?? null,
      "duty.rate": d.dutyRate ?? null,
      "duty.assessed": d.dutyAssessed ?? null,
      "duty.paid": d.dutyPaid ?? null,
      "duty.exemptionCode": d.exemptionCode ?? null,
      "rel.bol": d.bolNumber ? cargoId(`bol:NCS:${d.bolNumber.trim()}`) : null,
      "rel.manifest": d.manifestNumber ? cargoId(`manifest:NCS:${d.manifestNumber.trim()}`) : null,
      "rel.consignee": companyId(d.consigneeRcNumber, d.consigneeName),
      "rel.shipper": companyId(d.shipperRcNumber, d.shipperName),
      "rel.declarant": companyId(d.declarantRcNumber, undefined),
      "rel.vessel": d.vesselImo ? `vessel:imo:${d.vesselImo.replace(/\D/g, "")}` : null,
      "rel.portOfDischarge": portRef(d.portOfDischarge),
      rawHash: stableHash(d),
    };

    return withCanonicalId(
      normalizeRecord({
        source: this.id,
        sourceName: this.displayName,
        grade: "VERIFIED",
        entity: { kind: "cargo", nativeId: `declaration-${sad}`, label: `SAD ${sad}` },
        kind: "compliance",
        fields,
        observedAt: d.lodgedAt ?? d.updatedAt ?? new Date().toISOString(),
        providerRecordId: sad,
        excerpt: `NCS declaration SAD ${sad}${d.status ? ` · ${d.status}` : ""}`,
        units: {
          declaredValue: d.currency ?? "NGN",
          cifValue: d.currency ?? "NGN",
          dutyAssessed: d.currency ?? "NGN",
          dutyPaid: d.currency ?? "NGN",
        },
      }),
      cargoId(`declaration:NCS:${sad}`),
    );
  }

  /**
   * Framework validation plus the CAPABILITY.CARGO v1.0 cargo rules.
   * Flags, never drops — the officer sees the defect and decides.
   */
  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation {
    const issues: ValidationIssue[] = [...validateRecords(records).issues];
    const bolSeen = new Map<string, string>();

    for (const r of records) {
      const f = r.fields as Record<string, EvidenceFieldValue>;

      const container = f["container.number"];
      if (typeof container === "string" && f["container.checkDigitValid"] === false) {
        issues.push({
          evidenceId: r.id,
          code: "missing-required",
          message: `Container ${container} fails the ISO 6346 check digit — the number as supplied cannot be trusted.`,
          severity: "error",
        });
      }

      const dutiable = f["value.declared"] != null || f["cargo.packages"] != null;
      if (dutiable && f["cargo.description"] != null && f["cargo.hsCode"] == null) {
        issues.push({
          evidenceId: r.id,
          code: "missing-required",
          message: "Dutiable cargo item carries no HS code — duty cannot be assessed from this line.",
          severity: "warn",
        });
      }

      for (const key of ["cargo.grossWeightKg", "cargo.netWeightKg"]) {
        const weight = f[key];
        if (weight == null) continue;
        const unit = r.units?.[key.replace("cargo.", "")] ?? r.units?.[key];
        if (unit !== undefined && unit !== "kg") {
          issues.push({
            evidenceId: r.id,
            code: "unit-mismatch",
            message: `${key} is reported in "${unit}" — CAPABILITY.CARGO requires kilograms.`,
            severity: "error",
          });
        }
      }

      const bol = f["bol.number"];
      if (typeof bol === "string" && r.kind === "cargo") {
        const prior = bolSeen.get(bol);
        if (prior && prior !== r.id) {
          issues.push({
            evidenceId: r.id,
            code: "duplicate",
            message: `Bill of Lading ${bol} appears on more than one record in this acquisition.`,
            severity: "info",
          });
        } else {
          bolSeen.set(bol, r.id);
        }
      }

      const revenueField = f["duty.assessed"] ?? f["duty.paid"] ?? f["value.declared"];
      if (revenueField != null && (r.grade === "REPORTED" || r.grade === "INFERRED" || r.grade === "UNKNOWN")) {
        issues.push({
          evidenceId: r.id,
          code: "low-source-confidence",
          message: `Revenue figure carried at grade ${r.grade} — not sufficient on its own for an assessment.`,
          severity: "warn",
        });
      }
    }

    return { issues };
  }
}

function portRef(value: string | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
  return /^[A-Za-z]{5}$/.test(t) ? `port:unlocode:${t.toUpperCase()}` : `port:name:${t.toLowerCase()}`;
}

export const ncsCustomsProvider = new NcsCustomsProvider();

/** The frozen EvidenceCache remains the only cache used by this provider. */
export type NcsCustomsCache = EvidenceCache;

/** search() returns the frozen ConnectorResult envelope, unchanged. */
export type NcsCustomsProviderResult = ConnectorResult;
