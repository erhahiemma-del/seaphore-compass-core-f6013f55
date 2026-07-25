import type { Detector } from "../types";
import { aisBehaviourDetector } from "./ais";
import { routeDeviationDetector } from "./route";
import { ownershipChurnDetector } from "./ownership";
import { sanctionsProximityDetector } from "./sanctions-proximity";
import { cargoAnomalyDetector } from "./cargo";
import { complianceRecurrenceDetector } from "./compliance";
import { revenueAnomalyDetector } from "./revenue";

export const DEFAULT_DETECTORS: ReadonlyArray<Detector> = [
  aisBehaviourDetector,
  routeDeviationDetector,
  ownershipChurnDetector,
  sanctionsProximityDetector,
  cargoAnomalyDetector,
  complianceRecurrenceDetector,
  revenueAnomalyDetector,
];
