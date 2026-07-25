# Maritime Investigation Workspace (MIW)

Evolve the existing Intelligence Investigation Workspace (IIW at `src/routes/workspace.$id.tsx` + `src/stores/workspace.store.ts`) into a full operational investigation system. This is a large sprint — I'll scope it into 4 landings so each ship is verifiable rather than a single mega-change. All existing sprints (1A–1D, IFE, OSAE, Identity Resolution, Executive Brief, Evidence Explorer) remain untouched and are consumed, never bypassed.

## Landing 1 — Data model + Investigation Dashboard

New Intelligence Centre at `/investigations` (Maritime Investigation Workspace).

- Extend `workspace.store.ts` (persisted Zustand) with investigation record fields: `title`, `description`, `investigationType`, `priority`, `status` (Open · In Review · Escalated · Closed · Archived), `createdBy`, `leadInvestigator`, `team[]`, `dueDate`, `classification` (Public · Restricted · Confidential · Secret), `region`, `ports[]`, `countries[]`, `tags[]`, `linkedInvestigations[]`, `relatedIncidents[]`, `revenueAtRisk`, `recoveredRevenue`. Persist alongside existing evidence/notes/tasks/timeline. No schema migration — investigations already exist in the store and the `investigations` DB table.
- Dashboard cards (13): Active · New Today · High Priority · Critical Priority · Open Tasks · Pending Intel Requests · Evidence Collected · Revenue At Risk · Recovered Revenue · Avg Duration · Investigations Closed · High-Risk Vessels · High-Risk Companies. All derived from store selectors.
- Investigations table with filters (status, priority, type, region, officer, tag) and global search.
- Register `capability.maritime-investigation-workspace` in the Projection Contract.

## Landing 2 — Investigation Record (single-investigation view)

Replace `workspace.$id.tsx` panels with a tabbed workspace at `/investigations/$id`:

- **Overview**: Intelligence Summary panel (auto-generated from OSAE + IFE Unified Intelligence Package — priority, risk score, confidence, revenue-at-risk, entities grouped by type). Never copies evidence, references the UIP.
- **Timeline**: chronological activity feed rendered from existing `timeline[]` (extended with typed events: intel-received, evidence-attached, task-created, note-added, brief-generated, escalation, decision).
- **Evidence**: embed the existing `IntelligenceEvidenceExplorer` with `investigation` filter pre-applied. Read-only — evidence is referenced through UIP, not copied.
- **Notebook**: append-only notes with Markdown, entry types (Note · Observation · Hypothesis · Recommendation · Decision · Question · Task), author, timestamp. Every entry writes an `audit_log` row and is immutable in-store (new versions supersede but history is preserved).
- **Tasks**: create/assign/complete tasks with owner, priority, status, due date, dependencies (task IDs), evidence links. Auto-generated timeline events.
- **Recommendations**: derived from OSAE outputs — Immediate Inspection · Revenue Audit · Monitor · Escalate · Close, each with confidence, supporting evidence citations, alternative views, reasoning.
- **Copilot**: embedded `AskCopilotDialog` scoped to the investigation's UIP (subject + evidence context passed in).
- **Collaboration**: mentions/comments on notebook entries, assignment log, activity feed, version history from audit_log.

Persistent header with title, priority chip, status pill, classification, lead investigator, team avatars.

## Landing 3 — Reporting Centre

New `src/services/reporting/` pipeline. **Reports always consume investigation-curated data**, never raw connectors.

- Report Engine (`report-engine.ts`) takes `{ investigation, uip, brief, osae, evidence }` and produces a normalized `ReportPackage` with the standard sections (Executive Summary · Key Findings · Evidence Summary · Entity Relationships · Timeline · Revenue · Risk · OSAE Recs · Supporting Evidence · Confidence · Sources · Appendices).
- 11 report types (Executive · Operational · Investigation · Cargo Intel · Container · Manifest · Revenue · Port · Compliance · Historical Comparison · Trend Analysis) as configuration presets over the same engine — each selects which sections to include and emphasize.
- Export adapters:
  - **PDF** — extend existing `jspdf` compliance export (`src/lib/compliance/export-compliance-report.ts`) into a shared PDF renderer.
  - **DOCX** — `docx` npm package.
  - **XLSX** — new `xlsx` or existing pattern.
  - **PPTX** — `pptxgenjs`.
- All formats carry immutable footer, confidence chips per section, evidence provenance table.
- "Generate Report" action on the investigation record, with format + type picker. Registered in Projection Contract.

## Landing 4 — Historical Intelligence + Global Search

- Historical comparison panel on investigation record: Yesterday · Last 7 · Last 30 · Previous Quarter · Previous Year. Compares risk score, evidence count, revenue at risk, entity churn against archived snapshots (stored in-store per investigation as time-series).
- Global Search route `/investigations/search` — searches across investigations, vessels, companies, cargo, containers, manifests, ports, agents, revenue, risk, evidence, officer, date. Uses in-store index + existing `IntelligenceEvidenceExplorer` filter language.
- RBAC gating using existing `use-permissions` hook: Investigator (create/edit own + assigned) · Supervisor (assign, approve) · Director (all) · Administrator (all + config) · Auditor (read-only + audit log access). Guards are UI-level; every mutation still writes to `audit_log`.

## Technical notes

- **No schema migrations** required for Landings 1–2. Investigations remain in the persisted store; the existing `investigations` DB table is untouched. If Landing 3–4 need durable server storage (e.g. cross-device), we add it as a follow-up sprint.
- **Zero duplication**: Evidence view = `IntelligenceEvidenceExplorer`. Brief = existing `ExecutiveBriefing`. Assessment = OSAE outputs. Identity = existing resolver. Copilot = existing OIE via IBE.
- **Projection Contract**: 4 new entries — `capability.maritime-investigation-workspace`, `capability.investigation-notebook`, `capability.investigation-tasks`, `capability.reporting-centre`.
- **Immutable footer** on every workspace surface and every exported report.
- **Confidence chips** on every recommendation, KPI card, and report section.

## What I need from you before starting

Two decisions so Landings 3–4 don't churn:

1. **Storage scope**: keep investigations in the persisted browser store (fast, offline-friendly, single-device) OR also mirror to Supabase for cross-device/team collaboration? The latter needs an RLS-scoped `investigations`/`investigation_notes`/`investigation_tasks` schema and adds ~1 landing of work.
2. **Report libraries**: OK to add `docx`, `xlsx` (SheetJS community), and `pptxgenjs` as dependencies? Alternative is PDF-only for this sprint with the others as a follow-up.

Once confirmed I'll ship Landing 1 first (dashboard + data model), then request review before proceeding.