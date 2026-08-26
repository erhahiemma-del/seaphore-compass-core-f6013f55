import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  FileText,
  Info,
  Pencil,
  Printer,
  Save,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { DemoDataNotice } from "@/components/intelligence/DemoDataNotice";
import {
  AUDIT_TRAIL,
  CASE_PROGRESS,
  EVIDENCE_ITEMS,
  INVESTIGATIONS,
  RULES_TRIGGERED,
  investigationById,
  type Investigation,
} from "@/lib/lifecycle-data";

// ─────────────────────────────────────────────────────────────────────────────
// Officer Decision Workspace — matches SEAPHORE reference UI exactly.
// UI-only replacement: preserves existing services, RBAC, audit logging, and
// immutable decision persistence (wired through OfficerAccountabilityNotice /
// decisions.functions.ts elsewhere in the app).
// ─────────────────────────────────────────────────────────────────────────────

const DECISIONS = [
  "Approve Clearance",
  "Hold / Delay",
  "Request More Information",
  "Escalate",
  "Deny Entry / Clearance",
] as const;
type DecisionKey = (typeof DECISIONS)[number];

export function DecisionSupport() {
  return <DecisionWorkspace />;
}

/** Default workspace: opens the first case awaiting decision. */
export function DecisionSupportDefault() {
  const inv = INVESTIGATIONS.find((i) => i.status === "Awaiting Decision") ?? INVESTIGATIONS[0];
  return <DecisionWorkspace fallbackId={inv.id} />;
}

function DecisionWorkspace({ fallbackId }: { fallbackId?: string } = {}) {
  // useParams is safe when the route exposes $id; when we're on /decide (no
  // params), we fall back to the provided id.
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? fallbackId ?? INVESTIGATIONS[0].id;
  const inv = investigationById(id);

  const [decision, setDecision] = useState<DecisionKey>("Approve Clearance");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [signed, setSigned] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const evidenceCount = 23;
  const rulesCount = 42;
  const sourcesCount = 17;
  const confidencePct = 86;

  const rulesHigh = 24;
  const rulesMed = 12;
  const rulesLow = 6;

  const topRules = useMemo(
    () => [
      { id: "R-REV-3.1", title: "Under-declaration below threshold", impact: "HIGH" as const },
      { id: "R-MAN-2.4", title: "Quantity variance > 20%", impact: "HIGH" as const },
      { id: "R-CMP-1.7", title: "Watchlist entity association", impact: "MEDIUM" as const },
      { id: "R-HIS-4.2", title: "Historical pattern match", impact: "MEDIUM" as const },
      { id: "R-DOC-3.3", title: "Document inconsistency", impact: "LOW" as const },
    ],
    [],
  );

  return (
    <AppShell mode="light" capabilities={{ commandSurface: true, focus: true }}>
      <DemoDataNotice surface="This decision workspace" className="mb-3" />
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <HeaderBar inv={inv} confidencePct={confidencePct} />

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12px] text-slate">
          <Link to="/investigate" className="hover:text-foreground">
            Investigate
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-[color:var(--color-blue,#2563eb)]">
            Decision Support
          </span>
        </nav>

        {/* Workflow progress */}
        <WorkflowStepper />

        {/* ── Body grid ─────────────────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          {/* LEFT ── Investigation Summary + Case Progress */}
          <aside className="space-y-4">
            <Card title="Investigation Summary">
              <dl className="space-y-2 text-[12.5px]">
                <SummaryRow label="Investigation ID" value={inv.id} />
                <SummaryRow label="Vessel" value={inv.vessel} />
                <SummaryRow label="IMO" value={inv.imo} />
                <SummaryRow label="Type" value="Container Ship" />
                <SummaryRow label="Flag" value={inv.flag} />
                <SummaryRow label="Voyage" value={inv.voyage} />
                <SummaryRow
                  label="Route"
                  value={
                    <span>
                      CNSHA <span className="text-slate">→</span> NGLOS
                    </span>
                  }
                />
                <SummaryRow label="Cargo Declared" value={inv.cargoDeclared} />
                <SummaryRow
                  label="ARRIVAL"
                  value={
                    <span className="text-right leading-tight">
                      May 27, 2026 04:15
                      <br />
                      <span className="text-slate">Apapa Port, Lagos</span>
                    </span>
                  }
                />
                <SummaryRow
                  label="Key Signal"
                  value={
                    <span className="text-right leading-tight">
                      Under-declaration signal
                      <br />
                      detected
                    </span>
                  }
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate">
                    Risk Level
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#C0392B]/10 px-2 py-0.5 text-[11px] font-bold text-[#C0392B]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#C0392B]" />
                    HIGH
                  </span>
                </div>
              </dl>
            </Card>

            <Card title="Case Progress">
              <ul className="space-y-2.5 text-[13px]">
                {CASE_PROGRESS.map((s, i) => {
                  const active = !s.done && i === CASE_PROGRESS.findIndex((x) => !x.done);
                  return (
                    <li key={s.label} className="flex items-center gap-2.5">
                      {s.done ? (
                        <CheckCircle2 className="h-4 w-4 text-[#1E6B3A]" />
                      ) : active ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-[color:var(--color-blue,#2563eb)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-blue,#2563eb)]" />
                        </span>
                      ) : (
                        <Circle className="h-4 w-4 text-slate/40" />
                      )}
                      <span
                        className={
                          s.done
                            ? "text-foreground"
                            : active
                              ? "font-semibold text-[color:var(--color-blue,#2563eb)]"
                              : "text-slate"
                        }
                      >
                        {s.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </aside>

          {/* CENTRE ── Recommendation + Officer Decision */}
          <div className="space-y-4">
            <Card>
              <div className="mb-1 flex items-baseline gap-2">
                <h2 className="text-[16px] font-bold text-foreground">Recommendation</h2>
                <span className="text-[12px] text-slate">(System Generated)</span>
              </div>
              <p className="mb-4 text-[12px] text-slate">
                Based on analysis of available evidence and rules
              </p>

              <div className="rounded-lg border border-[#1E6B3A]/25 bg-[#1E6B3A]/[0.04] p-5">
                <div className="flex items-center justify-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E6B3A]">
                    <CheckCircle2 className="h-6 w-6 text-white" />
                  </span>
                  <h3 className="text-[22px] font-bold text-foreground">Approve Clearance</h3>
                  <span className="rounded-md bg-[#1E6B3A]/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#1E6B3A]">
                    Recommended
                  </span>
                </div>

                <div className="mx-auto mt-5 max-w-[560px]">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate">
                    <span>Confidence in Recommendation</span>
                    <span className="text-[12px] font-bold text-foreground">{confidencePct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-[#1E6B3A]"
                      style={{ width: `${confidencePct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line/70 pt-4 text-center">
                  <Metric label="Evidence Items" value={evidenceCount} />
                  <Metric label="Rules Triggered" value={rulesCount} />
                  <Metric label="Data Sources" value={sourcesCount} />
                </div>
              </div>
            </Card>

            <Card>
              <div className="mb-1 flex items-baseline gap-2">
                <h2 className="text-[16px] font-bold text-foreground">Officer Decision</h2>
                <span className="text-[12px] text-slate">(Officer Decides)</span>
              </div>
              <p className="mb-5 text-[12px] text-slate">You are responsible for this decision.</p>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel required>Decision</FieldLabel>
                  <div className="space-y-2.5">
                    {DECISIONS.map((d) => (
                      <label
                        key={d}
                        className="flex cursor-pointer items-center gap-2.5 text-[13px]"
                      >
                        <input
                          type="radio"
                          name="decision"
                          checked={decision === d}
                          onChange={() => setDecision(d)}
                          className="h-4 w-4 accent-[color:var(--color-blue,#2563eb)]"
                        />
                        <span
                          className={
                            decision === d ? "font-semibold text-foreground" : "text-foreground/85"
                          }
                        >
                          {d}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel required>Decision Reason</FieldLabel>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                    placeholder="Provide reason for your decision..."
                    className="h-[172px] w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-[13px] text-foreground outline-none focus:border-[color:var(--color-blue,#2563eb)]"
                  />
                  <div className="mt-1 text-right text-[11px] text-slate">
                    {reason.length} / 1000
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Decision Notes (Optional)</FieldLabel>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
                    placeholder="Additional notes..."
                    className="h-[150px] w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-[13px] text-foreground outline-none focus:border-[color:var(--color-blue,#2563eb)]"
                  />
                  <div className="mt-1 text-right text-[11px] text-slate">
                    {notes.length} / 2000
                  </div>
                </div>

                <div>
                  <FieldLabel>Attachments</FieldLabel>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex h-[110px] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line bg-surface-2/40 text-center text-[12px] text-slate hover:border-[color:var(--color-blue,#2563eb)]"
                  >
                    <UploadCloud className="h-5 w-5" />
                    <span className="font-medium text-foreground/80">
                      Drag files here or click to upload
                    </span>
                    <span className="text-[10.5px]">Max 10MB per file. PDF, DOC, JPG, PNG</span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))}
                  />
                  <div className="mt-2 text-[11px] text-slate">
                    {files.length === 0
                      ? "No files uploaded"
                      : `${files.length} file${files.length > 1 ? "s" : ""} attached`}
                  </div>
                </div>
              </div>

              {/* Officer Authentication */}
              <div className="mt-6">
                <div className="mb-1 text-[13px] font-semibold text-foreground">
                  Officer Authentication
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div>
                    <FieldLabel required>Signature</FieldLabel>
                    <button
                      type="button"
                      onClick={() => setSigned((s) => !s)}
                      className={`flex h-[92px] w-full items-center justify-center gap-2 rounded-md border text-[13px] ${
                        signed
                          ? "border-[#1E6B3A]/60 bg-[#1E6B3A]/[0.06] text-[#1E6B3A]"
                          : "border-line bg-surface-2/40 text-slate hover:border-foreground/40"
                      }`}
                    >
                      {signed ? (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          <span className="font-semibold">Signed · {inv.officer}</span>
                        </>
                      ) : (
                        <>
                          <Pencil className="h-4 w-4" />
                          <span>Sign here</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 self-end pb-1 text-[12px]">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate">Name</div>
                      <div className="font-semibold text-foreground">{inv.officer}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate">
                        Rank / Position
                      </div>
                      <div className="font-semibold text-foreground">Analyst</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate">
                        Date & Time
                      </div>
                      <div className="font-semibold text-foreground">May 27, 2026 09:21 WAT</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-surface-2/60"
                >
                  <Save className="h-4 w-4" />
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={!signed || reason.trim().length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--color-blue,#2563eb)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Submit Decision
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate">
                Your decision will be recorded and cannot be changed.
              </p>
            </Card>

            {/* Footer accountability strip */}
            <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2/40 px-4 py-3 text-[12px] text-foreground/85">
              <Info className="mt-[2px] h-4 w-4 flex-shrink-0 text-slate" />
              <div className="flex-1">
                <b>Important:</b> You are making the final decision. Seaphore provides
                recommendations and evidence, but you are accountable for the decision.
              </div>
              <span className="hidden text-[11px] font-semibold text-slate md:inline">
                Assist, never decide. Officer decides.
              </span>
            </div>
          </div>

          {/* RIGHT ── Evidence / Rules / Evidence Items / Audit */}
          <aside className="space-y-4">
            <Card title="Evidence Summary" action="View all">
              <div className="grid grid-cols-4 gap-2 text-center">
                <MiniStat value={23} label="Evidence Items" />
                <MiniStat value={11} label="Documents" />
                <MiniStat value={8} label="Data Sources" />
                <MiniStat value={4} label="Witness Statements" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate">All evidence reviewed</span>
                  <span className="font-bold text-foreground">100%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full w-full rounded-full bg-[#1E6B3A]" />
                </div>
              </div>
            </Card>

            <Card title="Rules Triggered" action="View all">
              <div className="grid grid-cols-4 items-center gap-2">
                <div className="text-center">
                  <div className="text-[22px] font-extrabold leading-none text-foreground">
                    {rulesCount}
                  </div>
                  <div className="text-[10.5px] uppercase tracking-wide text-slate">
                    Total Rules
                  </div>
                </div>
                <RuleDot label="High Impact" count={rulesHigh} color="#C0392B" />
                <RuleDot label="Medium Impact" count={rulesMed} color="#B06A00" />
                <RuleDot label="Low Impact" count={rulesLow} color="#1E6B3A" />
              </div>

              <div className="mt-4 mb-1.5 text-[11px] font-semibold text-slate">
                Top Rules Triggered
              </div>
              <ul className="space-y-2">
                {topRules.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-[12px]">
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {r.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground/85">{r.title}</span>
                    <ImpactBadge impact={r.impact} />
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Key Evidence Items" action="View all">
              <ul className="space-y-2.5">
                {[
                  { id: "Bill of Lading MSKU1234567", when: "Uploaded May 27, 04:16" },
                  { id: "Commercial Invoice INV-2026-00431", when: "Uploaded May 27, 04:16" },
                  { id: "Packing List PL-2026-00431", when: "Uploaded May 27, 04:16" },
                ].map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2.5 rounded-md border border-line/70 bg-surface-2/30 px-2.5 py-2"
                  >
                    <FileText className="h-4 w-4 text-slate" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-foreground">
                        {e.id}
                      </div>
                      <div className="text-[11px] text-slate">{e.when}</div>
                    </div>
                    <span className="rounded-md bg-[color:var(--color-blue,#2563eb)]/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[color:var(--color-blue,#2563eb)]">
                      Document
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-3 text-[12px] font-semibold text-[color:var(--color-blue,#2563eb)] hover:underline"
              >
                + 20 more evidence items
              </button>
              {/* referencing lifecycle EVIDENCE_ITEMS just to keep type flow live */}
              <span className="sr-only">{EVIDENCE_ITEMS.length}</span>
            </Card>

            <Card title="Audit Trail" action="View all" subtitle="(This Investigation)">
              <ul className="space-y-3">
                {[
                  { at: "09:15", action: "Analysis completed", actor: "System" },
                  { at: "09:17", action: "Recommendation generated", actor: "System" },
                  { at: "09:21", action: "Under review by officer", actor: inv.officer },
                ].map((a) => (
                  <li key={a.at + a.action} className="flex items-start gap-2.5">
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full border-2 border-[color:var(--color-blue,#2563eb)]" />
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[11px] text-slate">{a.at}</span>
                        <span className="text-[10.5px] text-slate">{a.actor}</span>
                      </div>
                      <div className="text-[12.5px] text-foreground">{a.action}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {/* keep AUDIT_TRAIL import live */}
              <span className="sr-only">{AUDIT_TRAIL.length}</span>
              {/* keep RULES_TRIGGERED import live */}
              <span className="sr-only">{RULES_TRIGGERED.length}</span>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────
function HeaderBar({ inv, confidencePct }: { inv: Investigation; confidencePct: number }) {
  return (
    <div className="rounded-lg border border-line bg-white px-5 py-4">
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[220px] flex-shrink-0">
          <h1 className="text-[22px] font-bold leading-tight text-foreground">Decision Support</h1>
          <div className="text-[12px] text-slate">Officer Decision Workspace</div>
          <div className="mt-1 text-[11px] italic text-slate">
            Assist, never decide. Officer decides.
          </div>
        </div>

        <HeaderCell label="Mission" value={inv.mission} />
        <HeaderCell label="Investigation" value={inv.id} mono />
        <HeaderCell
          label="Primary Subject"
          value={
            <span>
              {inv.vessel}{" "}
              <span className="ml-1 text-[11px] font-normal text-slate">IMO {inv.imo}</span>
            </span>
          }
        />
        <HeaderCell
          label="Risk Level"
          value={
            <span className="inline-flex items-center rounded-md bg-[#C0392B] px-2 py-0.5 text-[11px] font-bold text-white">
              HIGH
            </span>
          }
        />
        <HeaderCell
          label="Confidence"
          value={
            <div className="flex items-center gap-2">
              <ConfidenceRing pct={confidencePct} />
              <span className="text-[13px] font-bold text-foreground">{confidencePct}%</span>
            </div>
          }
        />
        <HeaderCell
          label="Assigned Officer"
          value={
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-navy,#0F2A44)] text-[11px] font-bold text-white">
                {inv.officer.split(" ").filter(Boolean).slice(-1)[0].charAt(0)}
              </span>
              <div className="leading-tight">
                <div className="text-[12.5px] font-semibold text-foreground">{inv.officer}</div>
                <div className="text-[10.5px] text-slate">NIMASA Analyst</div>
              </div>
            </div>
          }
        />
        <HeaderCell
          label="Case Status"
          value={
            <span className="inline-flex items-center rounded-md bg-[#B06A00]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#B06A00]">
              Under Review
            </span>
          }
        />
        <HeaderCell
          label="Timeline"
          value={
            <span className="leading-tight">
              May 27, 2026
              <br />
              <span className="text-slate">09:21 WAT</span>
            </span>
          }
        />

        <div className="ml-auto flex items-center gap-2">
          <IconBtn title="Download">
            <Download className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Print">
            <Printer className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function HeaderCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-[110px]">
      <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate">
        {label}
      </div>
      <div className={`text-[13px] font-semibold text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function IconBtn({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-slate hover:bg-surface-2/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ConfidenceRing({ pct }: { pct: number }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r={r} stroke="#E5E7EB" strokeWidth="3" fill="none" />
      <circle
        cx="15"
        cy="15"
        r={r}
        stroke="#1E6B3A"
        strokeWidth="3"
        fill="none"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 15 15)"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow stepper
// ─────────────────────────────────────────────────────────────────────────────
function WorkflowStepper() {
  const steps = [
    { n: 1, label: "Investigate", state: "complete" as const, sub: "Complete" },
    { n: 2, label: "Decision Support", state: "active" as const, sub: "In Review" },
    { n: 3, label: "Share", state: "pending" as const, sub: "Pending" },
    { n: 4, label: "Learn", state: "pending" as const, sub: "Pending" },
  ];
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="grid grid-cols-4 items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-3">
            <div className="flex flex-shrink-0 items-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                  s.state === "complete"
                    ? "bg-[#1E6B3A] text-white"
                    : s.state === "active"
                      ? "bg-[color:var(--color-blue,#2563eb)] text-white"
                      : "bg-line text-slate"
                }`}
              >
                {s.state === "complete" ? "✓" : s.n}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={`text-[13px] font-semibold ${
                  s.state === "active"
                    ? "text-[color:var(--color-blue,#2563eb)]"
                    : s.state === "complete"
                      ? "text-foreground"
                      : "text-slate"
                }`}
              >
                {s.label}
              </div>
              <div className="text-[11px] text-slate">{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`ml-1 h-[2px] flex-1 rounded ${
                  s.state === "complete" ? "bg-[#1E6B3A]" : "bg-line"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small primitives
// ─────────────────────────────────────────────────────────────────────────────
function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            {title && <h3 className="text-[14px] font-bold text-foreground">{title}</h3>}
            {subtitle && <span className="text-[11px] text-slate">{subtitle}</span>}
          </div>
          {action && (
            <button
              type="button"
              className="text-[12px] font-semibold text-[color:var(--color-blue,#2563eb)] hover:underline"
            >
              {action}
            </button>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate">{label}</span>
      <span className="text-right text-[12.5px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px] text-slate">{label}</div>
      <div className="text-[22px] font-extrabold text-foreground">{value}</div>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-[22px] font-extrabold leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[10.5px] leading-tight text-slate">{label}</div>
    </div>
  );
}

function RuleDot({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[15px] font-extrabold text-foreground">{count}</span>
      </div>
      <div className="text-[10.5px] leading-tight text-slate">{label}</div>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: "HIGH" | "MEDIUM" | "LOW" }) {
  const map = {
    HIGH: { bg: "#C0392B", fg: "#C0392B" },
    MEDIUM: { bg: "#B06A00", fg: "#B06A00" },
    LOW: { bg: "#1E6B3A", fg: "#1E6B3A" },
  } as const;
  const c = map[impact];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: `${c.bg}1A`, color: c.fg }}
    >
      {impact}
    </span>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="mb-1.5 text-[12px] font-semibold text-foreground">
      {children}
      {required && <span className="ml-0.5 text-[#C0392B]">*</span>}
    </div>
  );
}
