/**
 * entities.service — FOLD-3 wrapper around entities.functions.ts.
 * Components import from here, never call the server fn directly.
 */
export {
  listEntities,
  getEntity,
  listEntityRelationships,
  searchEntities,
} from "@/lib/api/entities.functions";
