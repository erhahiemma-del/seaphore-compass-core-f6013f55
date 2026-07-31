import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchEntities from "./tools/search-entities";
import getEntityProfile from "./tools/get-entity-profile";
import listInvestigations from "./tools/list-investigations";
import getInvestigation from "./tools/get-investigation";
import listAlerts from "./tools/list-alerts";

// Direct Supabase host — the published proxy URL fails RFC 8414 issuer matching.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "seaphore-foundation",
  title: "Seaphore Foundation",
  version: "0.1.0",
  instructions:
    "Read-only maritime intelligence tools for Seaphore. Search the entity registry, open entity profiles with signals and alerts, list investigations and read their evidence and recorded decisions. Every record carries a confidence grade; gaps are reported explicitly. Evidence first. Explainable always. Officer decides.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchEntities, getEntityProfile, listInvestigations, getInvestigation, listAlerts],
});
