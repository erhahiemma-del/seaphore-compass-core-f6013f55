/**
 * Domain entity shapes — mirror the DB `entities` table + extension tables.
 * Kept UI-facing; DB row types live in `@/integrations/supabase/types`.
 */
export type EntityKind =
  | "vessel"
  | "voyage"
  | "company"
  | "person"
  | "port"
  | "container"
  | "cargo_item"
  | "document"
  | "manifest"
  | "regulation"
  | "agency"
  | "intelligence_report"
  | "signal";

export interface EntityRef {
  id: string;
  type: EntityKind;
  name: string;
}
