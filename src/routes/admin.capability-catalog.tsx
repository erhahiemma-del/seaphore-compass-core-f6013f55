/**
 * SPRINT GOV-01 — Intelligence Capability Catalog
 *
 * Read-only governance view in the Admin Console. Exposes the full
 * catalog, dependency matrix, and roadmap timeline. No runtime
 * architecture changes — pure data projection.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CAPABILITY_CATALOG,
  DEPENDENCY_MATRIX,
  catalogSummary,
  type CapabilityEntry,
  type CapabilityStatus,
  type CapabilityDomain,
  type MaturityLevel,
} from "@/lib/intelligence/capability-catalog";

export const Route = createFileRoute("/admin/capability-catalog")({
  head: () => ({
    meta: [
      { title: "Intelligence Capability Catalog · Seaphore Governance" },
      {
        name: "description",
        content:
          "Single source of truth for all Seaphore intelligence domains: status, providers, KPIs, dependencies.",
      },
    ],
  }),
  component: CapabilityCatalogPage,
});

// ── Status/maturity display helpers ─────────────────────────────────

const STATUS_META: Record<CapabilityStatus, { label: string; dot: string; className: string }> = {
  OPERATIONAL: {
    label: "Operational",
    dot: "🟢",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  },
  DESIGNING: {
    label: "Designing",
    dot: "🟡",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  PLANNED: {
    label: "Planned",
    dot: "🔵",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  },
};

const CREDENTIAL_META = {
  OPERATIONAL: { dot: "🟢", label: "Operational", cls: "text-emerald-600" },
  AWAITING_CREDENTIALS: { dot: "🟡", label: "Awaiting credentials", cls: "text-amber-600" },
  PLANNED: { dot: "🔵", label: "Planned", cls: "text-sky-600" },
};

const DOMAIN_LABEL: Record<CapabilityDomain, string> = {
  vessel: "Vessel",
  cargo: "Cargo",
  revenue: "Revenue",
  risk: "Risk",
  compliance: "Compliance",
  port: "Port",
  environmental: "Environmental",
  operational: "Operational",
};

const MATURITY_LABEL: Record<MaturityLevel, string> = {
  1: "Concept",
  2: "Architecture",
  3: "Core pipeline",
  4: "Integration ready",
  5: "Fully operational",
};

type View = "catalog" | "dependencies" | "roadmap";

// ── Main page ────────────────────────────────────────────────────────

function CapabilityCatalogPage() {
  const [view, setView] = useState<View>("catalog");
  const [domain, setDomain] = useState<"ALL" | CapabilityDomain>("ALL");
  const [status, setStatus] = useState<"ALL" | CapabilityStatus>("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const summary = useMemo(() => catalogSummary(), []);

  const filtered = useMemo(
    () =>
      CAPABILITY_CATALOG.filter(
        (c) =>
          (domain === "ALL" || c.domain === domain) && (status === "ALL" || c.status === status),
      ),
    [domain, status],
  );

  const selectedCap = selected ? CAPABILITY_CATALOG.find((c) => c.id === selected) : null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Intelligence Capability Catalog
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Single source of truth for all Seaphore intelligence domains. Every capability includes
            purpose, status, evidence providers, UIP projections, KPIs, dependencies, and known
            blockers. Read-only governance view.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["catalog", "dependencies", "roadmap"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "catalog" ? "Catalog" : v === "dependencies" ? "Dependencies" : "Roadmap"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          { label: "Capabilities", value: summary.total },
          { label: "Operational", value: summary.operational, tone: "emerald" },
          { label: "Designing", value: summary.designing, tone: "amber" },
          { label: "Planned", value: summary.planned, tone: "sky" },
          { label: "Avg maturity", value: `${summary.avgMaturity}/5` },
          { label: "Total blockers", value: summary.totalBlockers, tone: "red" },
          { label: "Providers", value: summary.totalProviders },
          { label: "Providers live", value: summary.operationalProviders, tone: "emerald" },
        ].map(({ label, value, tone }) => (
          <StatCard key={label} label={label} value={String(value)} tone={tone} />
        ))}
      </div>

      {view === "catalog" && (
        <CatalogView
          filtered={filtered}
          domain={domain}
          status={status}
          selected={selectedCap}
          onDomainChange={setDomain}
          onStatusChange={setStatus}
          onSelect={(id) => setSelected(selected === id ? null : id)}
        />
      )}
      {view === "dependencies" && <DependencyView />}
      {view === "roadmap" && <RoadmapView />}
    </div>
  );
}

// ── Catalog view ─────────────────────────────────────────────────────

function CatalogView({
  filtered,
  domain,
  status,
  selected,
  onDomainChange,
  onStatusChange,
  onSelect,
}: {
  filtered: ReadonlyArray<CapabilityEntry>;
  domain: "ALL" | CapabilityDomain;
  status: "ALL" | CapabilityStatus;
  selected: CapabilityEntry | null;
  onDomainChange: (d: "ALL" | CapabilityDomain) => void;
  onStatusChange: (s: "ALL" | CapabilityStatus) => void;
  onSelect: (id: string) => void;
}) {
  const domains: Array<"ALL" | CapabilityDomain> = [
    "ALL",
    "vessel",
    "cargo",
    "revenue",
    "risk",
    "compliance",
    "port",
    "environmental",
    "operational",
  ];
  const statuses: Array<"ALL" | CapabilityStatus> = ["ALL", "OPERATIONAL", "DESIGNING", "PLANNED"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          {domains.map((d) => (
            <FilterChip
              key={d}
              label={d === "ALL" ? "All domains" : DOMAIN_LABEL[d]}
              active={domain === d}
              onClick={() => onDomainChange(d)}
            />
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          {statuses.map((s) => (
            <FilterChip
              key={s}
              label={s === "ALL" ? "All status" : STATUS_META[s].label}
              active={status === s}
              onClick={() => onStatusChange(s)}
            />
          ))}
        </div>
      </div>

      <div
        className={`grid gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_420px]" : "grid-cols-1"}`}
      >
        {/* Cards */}
        <div className="grid gap-3 auto-rows-min sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cap) => (
            <CapabilityCard
              key={cap.id}
              cap={cap}
              isSelected={selected?.id === cap.id}
              onClick={() => onSelect(cap.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No capabilities match this filter.
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && <CapabilityDetail cap={selected} />}
      </div>
    </div>
  );
}

function CapabilityCard({
  cap,
  isSelected,
  onClick,
}: {
  cap: CapabilityEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const sm = STATUS_META[cap.status];
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border bg-card p-4 text-left transition-all hover:shadow-sm ${
        isSelected
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-border/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {DOMAIN_LABEL[cap.domain]}
          </div>
          <div className="mt-0.5 font-semibold text-foreground">{cap.name}</div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${sm.className}`}
        >
          {sm.dot} {sm.label}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{cap.purpose}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <MaturityBar level={cap.maturity} />
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{cap.evidenceProviders.length} providers</span>
          <span>·</span>
          <span>{cap.kpis.length} KPIs</span>
          {cap.blockers.length > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-600">{cap.blockers.length} blockers</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function MaturityBar({ level }: { level: MaturityLevel }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {([1, 2, 3, 4, 5] as const).map((l) => (
          <div
            key={l}
            className={`h-1.5 w-5 rounded-sm ${l <= level ? "bg-emerald-500" : "bg-muted"}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">{MATURITY_LABEL[level]}</span>
    </div>
  );
}

function CapabilityDetail({ cap }: { cap: CapabilityEntry }) {
  const sm = STATUS_META[cap.status];
  return (
    <aside className="rounded-lg border border-border bg-card overflow-y-auto max-h-[calc(100vh-18rem)] sticky top-6">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {DOMAIN_LABEL[cap.domain]}
            </div>
            <div className="font-semibold text-foreground">{cap.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{cap.id}</div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${sm.className}`}
          >
            {sm.dot} {sm.label}
          </span>
        </div>
        <MaturityBar level={cap.maturity} />
      </div>

      <div className="divide-y divide-border">
        <Section title="Purpose">
          <p className="text-xs text-muted-foreground">{cap.purpose}</p>
        </Section>

        <Section title="Owner">
          <p className="text-xs text-foreground">{cap.owner}</p>
        </Section>

        <Section title="Canonical Entities">
          <div className="flex flex-wrap gap-1">
            {cap.canonicalEntities.map((e) => (
              <Pill key={e} label={e} />
            ))}
          </div>
        </Section>

        <Section title={`Evidence Providers (${cap.evidenceProviders.length})`}>
          <ul className="space-y-1.5">
            {cap.evidenceProviders.map((p) => {
              const cm = CREDENTIAL_META[p.credentialStatus];
              return (
                <li key={p.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-foreground">{p.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{p.sprint}</div>
                  </div>
                  <span className={`text-[10px] font-medium ${cm.cls}`}>
                    {cm.dot} {cm.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={`KPIs (${cap.kpis.length})`}>
          <ul className="space-y-1.5">
            {cap.kpis.map((k) => (
              <li key={k.label}>
                <div className="text-xs font-medium text-foreground">
                  {k.label}
                  {k.unit ? ` (${k.unit})` : ""}
                </div>
                <div className="text-[10px] text-muted-foreground">{k.source}</div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Dashboard Surfaces">
          <ul className="space-y-1">
            {cap.dashboardSurfaces.map((s) => (
              <li key={s.route} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{s.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{s.route}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Copilot Features">
          <ul className="space-y-1">
            {cap.copilotFeatures.map((f) => (
              <li key={f} className="text-xs text-muted-foreground flex gap-1.5">
                <span className="shrink-0 text-emerald-500">›</span>
                {f}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="OIE Outputs">
          <ul className="space-y-1">
            {cap.oieOutputs.map((o) => (
              <li key={o} className="text-xs text-muted-foreground flex gap-1.5">
                <span className="shrink-0 text-sky-500">›</span>
                {o}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="UIP Projections">
          <div className="flex flex-wrap gap-1">
            {cap.uipProjections.map((p) => (
              <Pill key={p} label={p} mono />
            ))}
          </div>
        </Section>

        {cap.dependencies.length > 0 && (
          <Section title="Dependencies">
            <div className="flex flex-wrap gap-1">
              {cap.dependencies.map((d) => (
                <Pill key={d} label={d} tone="amber" mono />
              ))}
            </div>
          </Section>
        )}

        {cap.blockers.length > 0 && (
          <Section title={`Blockers (${cap.blockers.length})`}>
            <ul className="space-y-1.5">
              {cap.blockers.map((b) => (
                <li key={b} className="text-xs text-amber-700 flex gap-1.5">
                  <span className="shrink-0">⚠</span>
                  {b}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="px-4 py-2">
          <span className="text-[10px] text-muted-foreground">Reviewed {cap.reviewedAt}</span>
        </div>
      </div>
    </aside>
  );
}

// ── Dependency view ──────────────────────────────────────────────────

function DependencyView() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Dependency matrix — what each capability requires before it can operate. Arrows point from
        dependent to dependency.
      </p>

      {/* Adjacency table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                Capability
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Requires</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Required by</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Blockers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CAPABILITY_CATALOG.map((cap) => {
              const sm = STATUS_META[cap.status];
              const requires = DEPENDENCY_MATRIX.filter((e) => e.from === cap.id).map((e) => e.to);
              const requiredBy = DEPENDENCY_MATRIX.filter((e) => e.to === cap.id).map(
                (e) => e.from,
              );
              return (
                <tr key={cap.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                    {cap.name}
                    <div className="font-mono text-[10px] text-muted-foreground">{cap.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${sm.className}`}
                    >
                      {sm.dot} {sm.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {requires.length === 0 ? (
                      <span className="text-muted-foreground">None (foundational)</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {requires.map((r) => (
                          <Pill key={r} label={r.replace("cap.", "")} tone="amber" mono />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {requiredBy.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {requiredBy.map((r) => (
                          <Pill key={r} label={r.replace("cap.", "")} mono />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {cap.blockers.length > 0 ? (
                      <span className="text-amber-600 font-medium">{cap.blockers.length}</span>
                    ) : (
                      <span className="text-emerald-600">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dependency chain narrative */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Critical Path Analysis</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Foundational (no deps):</span> Vessel
            Intelligence, Environmental Intelligence — can operate independently once credentials
            are configured.
          </p>
          <p>
            <span className="font-medium text-foreground">First-order dependents:</span> Cargo
            Intelligence → Vessel Intelligence. Risk Intelligence → Vessel + Cargo. Compliance
            Intelligence → Vessel Intelligence.
          </p>
          <p>
            <span className="font-medium text-foreground">Second-order dependents:</span> Revenue
            Intelligence → Cargo Intelligence. Port Intelligence → Vessel Intelligence.
          </p>
          <p>
            <span className="font-medium text-foreground">Orchestration layer:</span> Operational
            Intelligence depends on all five upstream domains.
          </p>
          <p>
            <span className="font-medium text-foreground">Critical path to full operation:</span>{" "}
            Configure NCS credentials → Cargo Intelligence unlocks → Revenue and Risk Intelligence
            complete → Operational Intelligence achieves full playbook coverage.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Roadmap view ─────────────────────────────────────────────────────

function RoadmapView() {
  const phases = [
    {
      phase: "Phase 1 — Foundation (Complete)",
      tone: "emerald",
      items: [
        {
          label: "Evidence Provider Framework (spec v1.0, cert gate, 9 providers in catalog)",
          status: "OPERATIONAL" as const,
        },
        {
          label: "IAL (ConnectorManager, cache, normalization, validation, hashing)",
          status: "OPERATIONAL" as const,
        },
        {
          label: "IFE (fusion, conflict detection, source ranking, identity resolution)",
          status: "OPERATIONAL" as const,
        },
        {
          label: "Canonical UIP (registry, client store, single-source enforcement)",
          status: "OPERATIONAL" as const,
        },
        { label: "OIE — 8-module pipeline + 8 playbooks", status: "OPERATIONAL" as const },
        {
          label: "Environmental Intelligence (Open-Meteo, keyless, live)",
          status: "OPERATIONAL" as const,
        },
        {
          label: "OFAC + UNSC sanctions providers (keyless, live)",
          status: "OPERATIONAL" as const,
        },
        {
          label: "Copernicus CDSE provider (EP-COPERNICUS-01, OAuth, satellite imagery)",
          status: "OPERATIONAL" as const,
        },
        {
          label: "Cargo Workspace — 6 centres + Cargo Copilot + Knowledge Graph",
          status: "OPERATIONAL" as const,
        },
        { label: "MIBC export — PDF, DOCX, XLSX, PPTX", status: "OPERATIONAL" as const },
        {
          label: "Dashboard migration — /manifest, /revenue, /cargo → Canonical UIP",
          status: "OPERATIONAL" as const,
        },
      ],
    },
    {
      phase: "Phase 2 — Credential Activation (Imminent)",
      tone: "amber",
      items: [
        {
          label: "OpenSanctions API key → full sanctions screening across all capabilities",
          status: "DESIGNING" as const,
        },
        {
          label: "Equasis account → vessel ISM, class, PSC data for Compliance Intelligence",
          status: "DESIGNING" as const,
        },
        {
          label: "IMO GISIS token → authoritative certificate verification",
          status: "DESIGNING" as const,
        },
        {
          label: "GFW API token → AIS behaviour, port visits, dark-activity detection",
          status: "DESIGNING" as const,
        },
        {
          label: "OpenCorporates token → corporate registry for Ownership chains",
          status: "DESIGNING" as const,
        },
        {
          label: "Fix NCS provider ID (id='customs'→'ncs-customs') and projectionContractId",
          status: "DESIGNING" as const,
        },
        { label: "Set VITE_IAL_MODE=production in Lovable env", status: "DESIGNING" as const },
      ],
    },
    {
      phase: "Phase 3 — Government Access (Critical Path)",
      tone: "amber",
      items: [
        {
          label:
            "NCS/NICIS II API engagement → Cargo Intelligence fully live with VERIFIED-grade data",
          status: "DESIGNING" as const,
        },
        {
          label:
            "NCS credentials activate: manifest intelligence, revenue leakage, cargo Copilot dossier",
          status: "DESIGNING" as const,
        },
      ],
    },
    {
      phase: "Phase 4 — Capability Completion (Sprint Planning)",
      tone: "sky",
      items: [
        {
          label: "Compliance Intelligence — migrate /compliance from mock data to UIP",
          status: "PLANNED" as const,
        },
        {
          label:
            "Port Intelligence — migrate /ports from mock data to UIP; SAR anchorage monitoring",
          status: "PLANNED" as const,
        },
        {
          label: "Vessel Intelligence — migrate /vessel, /ownership from mock data to UIP",
          status: "PLANNED" as const,
        },
        {
          label: "Risk Intelligence — national risk KPIs from live evidence (not placeholders)",
          status: "PLANNED" as const,
        },
        {
          label: "GFW Satellite Intelligence — AIS-SAR fusion for dark-vessel corroboration",
          status: "PLANNED" as const,
        },
        {
          label: "NOAA / Copernicus ECMWF adapter — Environmental Intelligence Source 2+",
          status: "PLANNED" as const,
        },
      ],
    },
    {
      phase: "Phase 5 — Full Operational Readiness",
      tone: "sky",
      items: [
        {
          label: "All 8 intelligence capabilities at maturity level 5",
          status: "PLANNED" as const,
        },
        { label: "All credential gates cleared — every provider live", status: "PLANNED" as const },
        {
          label: "No intel-centre-data.ts mock data in any production route",
          status: "PLANNED" as const,
        },
        {
          label: "Test suite: E2E coverage for all capabilities end-to-end",
          status: "PLANNED" as const,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Roadmap based on repository evidence and OPS-03 operational certification findings. Phase 1
        is verified complete. Phases 2–5 are sprint-planning items.
      </p>
      {phases.map(({ phase, tone, items }) => (
        <div key={phase} className="rounded-lg border border-border bg-card overflow-hidden">
          <div
            className={`px-4 py-3 border-b border-border ${
              tone === "emerald"
                ? "bg-emerald-500/5"
                : tone === "amber"
                  ? "bg-amber-500/5"
                  : "bg-sky-500/5"
            }`}
          >
            <h3
              className={`text-sm font-semibold ${
                tone === "emerald"
                  ? "text-emerald-700"
                  : tone === "amber"
                    ? "text-amber-700"
                    : "text-sky-700"
              }`}
            >
              {phase}
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {items.map(({ label, status }) => {
              const sm = STATUS_META[status];
              return (
                <li key={label} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="shrink-0 text-sm">{sm.dot}</span>
                  <span className="text-sm text-foreground flex-1">{label}</span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${sm.className}`}
                  >
                    {sm.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "red"
          ? "text-red-600"
          : tone === "sky"
            ? "text-sky-600"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Pill({
  label,
  tone,
  mono,
}: {
  label: string;
  tone?: "amber" | "default";
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${
        tone === "amber"
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-border bg-muted text-foreground"
      } ${mono ? "font-mono" : ""}`}
    >
      {label}
    </span>
  );
}
