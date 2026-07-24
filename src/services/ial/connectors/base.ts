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

/**
 * Canonical capability vocabulary. Connectors advertise which
 * operational capabilities they can serve; orchestration selects
 * connectors by capability, never by connector id or display name.
 *
 * New capabilities are added here (never inside orchestration).
 */
export type ConnectorCapability =
  | "SANCTIONS"
  | "VESSEL_SCREENING"
  | "COMPANY_SCREENING"
  | "PERSON_SCREENING"
  | "OWNERSHIP"
  | "IDENTITY"
  | "POSITION"
  | "PORT_CALL"
  | "COMPLIANCE"
  | "CARGO";

export interface Connector {
  readonly id: ConnectorId;
  readonly displayName: string;

  /**
   * Capabilities this connector can serve. Discovery via
   * `ConnectorRegistry.getByCapability` filters on this list.
   * Optional for backward compatibility; a connector without
   * capabilities is invisible to capability-based selection.
   */
  readonly capabilities?: ReadonlyArray<ConnectorCapability>;

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
