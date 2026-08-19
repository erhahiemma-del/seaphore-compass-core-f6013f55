/**
 * Government data — public API.
 *
 * Nigerian government sources, their access position, and the connectors
 * built against them.
 *
 * Two rules hold across the domain:
 *
 * 1. **A blocked crawler does not deregister a source.** Crawler access,
 *    portal access and integration readiness are three separate fields,
 *    because a source can be blocked to bots, open to people and
 *    integrable by agreement all at once.
 *
 * 2. **An unconfigured connector returns no records and says why.** There
 *    is no fixture path that produces government-shaped records at
 *    runtime. Absence of access must never render as absence of vessels.
 */
export type {
  AccessMethod,
  AcquisitionRoute,
  CrawlerAccess,
  DataClass,
  EvidenceBasis,
  GovDataset,
  GovernmentDataSource,
  GovSourceStatus,
  IntegrationReadiness,
  LicenseTerms,
  PortalAccess,
  SourceHealth,
} from "./types";
export { ACQUISITION_PRIORITY } from "./types";

export {
  GovernmentDataSourceRegistry,
  GovernmentRegistryError,
  LICENSE_UNREVIEWED,
  NOSDRA_OIL_SPILL,
  NPA_SHIPPOS,
  governmentRegistry,
} from "./registry";

export {
  notConfigured,
  selectRoute,
  type DiscoveryReport,
  type FetchResult,
  type GovernmentDataAdapter,
  type RouteConfig,
} from "./adapter";

export { isAuthoritativeFor, rankByAuthority, sourceAuthority, type ClaimKind } from "./authority";

export {
  NPA_ACCEPTED_ROUTES,
  NPA_DATASETS,
  NpaShipposAdapter,
  isValidImo,
  npaShippos,
  parseNpaDate,
  type NpaDatasetId,
} from "./npa/shippos-adapter";

export {
  NPA_SCHEMA_VERSION,
  PORT_CALL_STAGES,
  type Agent,
  type Berth,
  type EtaObservation,
  type NpaVesselRef,
  type Port,
  type PortCall,
  type PortCallStage,
  type PortCallTransition,
  type PortSchedule,
  type Terminal,
} from "./npa/models";

export {
  coverageDays,
  createSnapshot,
  describeFailure,
  hasCoverageFor,
  ingest,
  snapshotVesselKey,
  type IngestionFailure,
  type IngestionOutcome,
  type LicenseStatus,
  type NpaDailySnapshot,
  type NpaDatasetKey,
  type ProcessingStatus,
  type SnapshotRecord,
} from "./npa/snapshot";

export {
  describeDrift,
  detectChanges,
  etaChanges,
  etaHistory,
  summarizeChanges,
  type EtaHistory,
  type EtaObservationPoint,
  type NpaChange,
  type NpaChangeType,
} from "./npa/change-detection";

export {
  APPROACH_RANGE_M,
  ARRIVAL_RANGE_M,
  STATIONARY_SPEED_KN,
  arrivedUnscheduled,
  buildPortCall,
  collectEtas,
  deriveStage,
  expectedNotArrived,
  matchAisToSchedule,
  type AisPosition,
  type PortAnchor,
} from "./npa/lifecycle";
