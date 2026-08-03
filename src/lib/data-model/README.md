# SEAPHORE — Data Model

The database is the single source of truth for every entity, relationship,
and confidence value in the platform. Screens read records; they do not
invent data structures or re-infer confidence.

## Universal entity base

Every entity — regardless of type — lives in `public.entities` with the
same nine universal fields:

| Field         | Column                                                    | Notes                                               |
| ------------- | --------------------------------------------------------- | --------------------------------------------------- |
| id            | `id`                                                      | UUID. Never changes. Never reused.                  |
| type          | `type`                                                    | `entity_type` enum (13 values).                     |
| name          | `name`                                                    | Primary display name. Vessel names guarded by HR-6. |
| aliases       | `aliases`                                                 | `text[]` of alternate names/numbers.                |
| confidence    | `confidence`                                              | `confidence_level` enum — the record's own tier.    |
| relationships | `relationships` table — typed, directional edges.         |
| evidenceIds   | `evidence_ids`                                            | `uuid[]` referencing `public.evidence`.             |
| riskScore     | `risk_score`                                              | 0–100. Decomposition lives in `risk_scores.inputs`. |
| history       | `entity_history` table — immutable per-entity change log. |

Per-type extensions (`vessels`, `voyages`, `manifests`, `cargo_items`,
`containers`, `documents`, `ports`, `companies`, `persons`,
`investigations`, `evidence`, `intelligence_reports`, `agencies`,
`regulations`) share `id` with `entities` and only hold the type-specific
columns. Do not duplicate universal fields.

## Confidence is data, not style

`public.confidence_level` has six levels: **OBSERVED, DECLARED, INFERRED,
CORROBORATED, VERIFIED, AUDITED**. Every record stores its own value.
The UI chip is derived from the record via `toChipTier(record.confidence)`
in `src/lib/data-model/confidence.ts`. Never override, re-infer, or hardcode
a chip in a component.

`VERIFIED` is only permitted when `source_id` and `source_name` are set to
a whitelisted authoritative source (HR-2, DB trigger
`assert_verified_has_source`).

## Roles

Roles live in `public.user_roles`, never on `profiles`. Membership is checked
by the security-definer function `public.has_role(uuid, app_role)` and
`public.is_officer_or_above(uuid)`. Analyst / Officer / Director / Admin
map to the RLS policies in the migration:

- Analyst — read + write own investigations and their evidence; cannot
  approve, close, or delete.
- Officer — full write on the operational graph and investigations that
  are not closed.
- Director — read all; only Admins can modify closed cases.
- Admin — full platform write; cannot delete `audit_log` or
  `entity_history` (append-only by policy).

## Immutability

`public.audit_log` and `public.entity_history` have no UPDATE or DELETE
policies and no UPDATE/DELETE grants. Nothing in the app — including
service_role — should ever mutate a written row.

## When you add a new module

1. Read from these tables. Do not create new tables that duplicate an
   entity or a per-type extension.
2. New relationship types are added to `RELATIONSHIP_TYPES` in
   `src/lib/data-model/index.ts` before use.
3. Every record write includes the record's `confidence` value.
4. Every mutation logs through `writeAuditLog()` (HR-9).
