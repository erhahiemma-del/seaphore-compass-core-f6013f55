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
// Sprint 1C — Global Fishing Watch. Registration is unconditional in
// the browser; credentials live on the server and are validated via
// the server-side health check (`gfwHealth`). The connector proxies
// all authenticated work to `src/lib/server/gfw.server.ts`.
registerConnector(globalFishingWatchConnector);

export { mockAisConnector, imoGisisConnector, equasisConnector, ofacSanctionsConnector, unEuSanctionsConnector, copernicusMarineConnector, uscgPsixConnector, ukCompaniesHouseConnector, cacNigeriaConnector, piClubPublicationsConnector, globalFishingWatchConnector };
