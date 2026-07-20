/**
 * Central registration point for all OSINT connector implementations.
 * Adding a new connector = import its module here and call registerConnector.
 */
import { registerConnector } from "../registry";
import { mockAisConnector } from "./mock";
import { imoGisisConnector } from "@/connectors/imo-gisis";

registerConnector(mockAisConnector);
registerConnector(imoGisisConnector);

export { mockAisConnector, imoGisisConnector };
