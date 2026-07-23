/**
 * Connector interface — every IAL connector, real or simulated, exposes
 * this shape. The OIE never sees a connector directly; it interacts with
 * the IAL only through an `EvidencePackage`.
 */
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  NormalizedEvidence,
} from "../types";

export interface Connector {
  readonly id: ConnectorId;
  readonly displayName: string;

  /** One-time setup (open a pool, resolve an OAuth token, etc.). */
  connect(): Promise<void>;
  /** Verify credentials / API key. Non-throwing — reports via return. */
  authenticate(): Promise<boolean>;

  /** Free-text or entity-shaped discovery. */
  search(query: AcquisitionQuery): Promise<ConnectorResult>;
  /** Exact lookup by canonical entity reference. */
  lookup(query: AcquisitionQuery): Promise<ConnectorResult>;

  /** Translate a provider-native record into the Seaphore evidence
   *  model. Kept on the connector so provider-specific field maps live
   *  next to the connector definition. */
  normalize(raw: unknown, query: AcquisitionQuery): NormalizedEvidence | null;

  /** Lightweight probe for the health matrix. */
  healthCheck(): Promise<ConnectorHealth>;
}
