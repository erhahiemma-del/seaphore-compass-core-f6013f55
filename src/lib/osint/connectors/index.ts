/**
 * Central registration point for all OSINT connector implementations.
 * Adding a new connector = import its module here and call registerConnector.
 */
import { registerConnector } from "../registry";
import { mockAisConnector } from "./mock";
import { imoGisisConnector } from "@/connectors/imo-gisis";
import { equasisConnector } from "@/connectors/equasis";
import { ofacSanctionsConnector } from "@/connectors/ofac-sanctions";
import { unEuSanctionsConnector } from "@/connectors/un---eu-sanctions";
import { copernicusMarineConnector } from "@/connectors/copernicus-marine--esa-";
import { uscgPsixConnector } from "@/connectors/uscg-psix";
import { ukCompaniesHouseConnector } from "@/connectors/uk-companies-house";
import { cacNigeriaConnector } from "@/connectors/cac-nigeria";
import { piClubPublicationsConnector } from "@/connectors/p-i-club-publications";
import { globalFishingWatchConnector } from "@/connectors/global-fishing-watch";

registerConnector(mockAisConnector);
registerConnector(imoGisisConnector);
registerConnector(equasisConnector);
registerConnector(ofacSanctionsConnector);
registerConnector(unEuSanctionsConnector);
registerConnector(copernicusMarineConnector);
registerConnector(uscgPsixConnector);
registerConnector(ukCompaniesHouseConnector);
registerConnector(cacNigeriaConnector);
registerConnector(piClubPublicationsConnector);
// Sprint 1C — Global Fishing Watch. Registers only when credentials are
// present; otherwise we log a warning and continue startup (per spec).
if (globalFishingWatchConnector.hasCredentials()) {
  registerConnector(globalFishingWatchConnector);
} else if (typeof console !== "undefined") {
  console.warn(
    "[seaphore] global-fishing-watch connector not registered: GLOBAL_FISHING_WATCH_API_KEY missing.",
  );
}

export { mockAisConnector, imoGisisConnector, equasisConnector, ofacSanctionsConnector, unEuSanctionsConnector, copernicusMarineConnector, uscgPsixConnector, ukCompaniesHouseConnector, cacNigeriaConnector, piClubPublicationsConnector, globalFishingWatchConnector };
