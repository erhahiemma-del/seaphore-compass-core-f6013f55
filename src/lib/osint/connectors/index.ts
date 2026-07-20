/**
 * Central registration point for all OSINT connector implementations.
 * Adding a new connector = import its module here and call registerConnector.
 */
import { registerConnector } from "../registry";
import { mockAisConnector } from "./mock";
import { imoGisisConnector } from "@/connectors/imo-gisis";
import { equasisConnector } from "@/connectors/equasis";

registerConnector(mockAisConnector);
registerConnector(imoGisisConnector);
registerConnector(equasisConnector);

export { mockAisConnector, imoGisisConnector, equasisConnector };
