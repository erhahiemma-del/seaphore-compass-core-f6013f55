/**
 * Central registration point for all OSINT connector implementations.
 * Adding a new connector = import its module here and call registerConnector.
 */
import { registerConnector } from "../registry";
import { mockAisConnector } from "./mock";
import { imoGisisConnector } from "@/connectors/imo-gisis";
import { equasisConnector } from "@/connectors/equasis";
import { ofacSanctionsConnector } from "@/connectors/ofac-sanctions";

registerConnector(mockAisConnector);
registerConnector(imoGisisConnector);
registerConnector(equasisConnector);
registerConnector(ofacSanctionsConnector);

export { mockAisConnector, imoGisisConnector, equasisConnector, ofacSanctionsConnector };
