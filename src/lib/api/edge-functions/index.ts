/**
 * Edge Function equivalents (Backend & API Contract, page 4).
 *
 * TanStack Start is the server runtime for this project, so each contracted
 * edge function is implemented as a `createServerFn` handler with the same
 * name and purpose. Route them from the corresponding API endpoints or call
 * them directly with `useServerFn`.
 *
 * | Contract name       | Implementation                                     |
 * | ------------------- | -------------------------------------------------- |
 * | generate-brief      | `generateBrief`                                    |
 * | score-risk          | `scoreRisk`                                        |
 * | detect-duplicates   | `detectDuplicates`                                 |
 * | copilot-query       | `copilotQueryFn` (see @/lib/orchestration.functions) |
 * | write-audit         | `writeAuditLog`  (see @/lib/audit.functions.ts)    |
 * | validate-manifest   | `validateManifest`                                 |
 */
export { generateBrief } from "./generate-brief.functions";
export { scoreRisk } from "./score-risk.functions";
export { detectDuplicates } from "./detect-duplicates.functions";
export { validateManifest } from "./validate-manifest.functions";
