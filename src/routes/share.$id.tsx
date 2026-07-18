import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  FileText,
  FileType2,
  Files,
  Lock,
  Mail,
  MessageCircle,
  Package,
  Plus,
  Printer,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { CaseHeaderBar } from "@/components/intelligence/InvestigationHeader";
import { ConfidenceChip } from "@/components/intelligence/ConfidenceChip";
import { LifecycleStepper } from "@/components/lifecycle-stepper";
import { PanelCard } from "@/components/panel-card";
import { PanelHead } from "@/components/panel-head";
import { RiskPill } from "@/components/intelligence/RiskPill";
import { cn } from "@/lib/utils";
import {
  AGENCY_RECIPIENTS,
  CLASSIFICATIONS,
  LANGUAGES,
  RECENT_SHARES,
  SHARE_OUTPUTS,
  investigationById,
  type Classification,
  type Language,
  type OutputType,
} from "@/lib/lifecycle-data";

export const Route = createFileRoute("/share/$id")({
  head: ({ params }) => ({ meta: [{ title: `${params.id} · Share · Seaphore` }] }),
  component: SharePage,
});

const OUTPUT_ICON: Record<OutputType, React.ElementType> = {
  "Generate Brief": FileText,
  "Generate PDF": FileType2,
  "Generate Word": Files,
  "Intelligence Pack": Package,
  Email: Mail,
  WhatsApp: MessageCircle,
  Print: Printer,
  Archive: Archive,
};

function SharePage() {
  const { id } = Route.useParams();
  const inv = investigationById(id);

  const [output, setOutput] = useState<OutputType>("Generate Brief");
  const [title, setTitle] = useState(`${inv.vessel} — Briefing (${inv.id})`);
  const [summary, setSummary] = useState(
    `Observed AIS gap and manifest discrepancy on ${inv.vessel} (IMO ${inv.imo}). Ownership graph and rules triggered support recommended clearance action.`,
  );
  const [classification, setClassification] = useState<Classification>("OFFICIAL–SENSITIVE");
  const [language, setLanguage] = useState<Language>("English");
  const [appendices, setAppendices] = useState({
    "Evidence List": true,
    "Full Timeline": true,
    "Supporting Documents": false,
  });
  const [recipients, setRecipients] = useState<Set<string>>(new Set(["CUSTOMS", "NAVY"]));
  const [externalEmails, setExternalEmails] = useState("");

  const recipientCount = useMemo(
    () => recipients.size + externalEmails.split(",").filter((e) => e.trim().length > 0).length,
    [recipients, externalEmails],
  );

  return (
    <AppShell title="Share" subtitle={inv.id} mode="light">
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
        <CaseHeaderBar
          investigationId={inv.id}
          vessel={inv.vessel}
          mission={inv.mission}
          officer={inv.officer}
          status="Awaiting Authorisation"
          risk={inv.risk}
          confidence="observed"
        />

        <LifecycleStepper
          steps={[
            { key: "inv", label: "Investigate", status: "complete" },
            { key: "ds", label: "Decision Support", status: "complete" },
            { key: "sh", label: "Share", status: "active" },
            { key: "learn", label: "Learn", status: "pending" },
          ]}
        />

        {/* SH-1 four-step tracker */}
        <ol className="grid gap-2 rounded-lg border border-line bg-card px-4 py-3 shadow-card sm:grid-cols-4">
          {[
            "1. Choose Output",
            "2. Configure Briefing",
            "3. Preview Brief",
            "4. Select Recipients",
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--color-teal)] text-white text-[11px] font-bold">
                {i + 1}
              </span>
              <span className="text-[12px] font-semibold text-foreground">{step.replace(/^\d+\.\s/, "")}</span>
            </li>
          ))}
        </ol>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {/* SH-2 output types */}
            <PanelCard>
              <PanelHead title="1. Choose Output" meta="How the brief is delivered" />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {SHARE_OUTPUTS.map((o) => {
                  const Icon = OUTPUT_ICON[o];
                  const active = output === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOutput(o)}
                      className={cn(
                        "flex flex-col items-start gap-1.5 rounded-md border px-3 py-2.5 text-left motion-fast",
                        active
                          ? "border-[color:var(--color-teal)] bg-[color:var(--color-teal)]/5"
                          : "border-line bg-surface hover:bg-surface-2",
                      )}
                    >
                      <Icon className="h-4 w-4 text-[color:var(--color-teal)]" />
                      <span className="text-[12px] font-semibold text-foreground">{o}</span>
                    </button>
                  );
                })}
              </div>
            </PanelCard>

            {/* SH-3 configure briefing */}
            <PanelCard>
              <PanelHead title="2. Configure Briefing" />
              <div className="grid gap-3">
                <label className="block">
                  <span className="type-label text-slate">Title</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-teal)]"
                  />
                </label>
                <label className="block">
                  <span className="type-label text-slate">Summary</span>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-teal)]"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="type-label text-slate">Classification</span>
                    <select
                      value={classification}
                      onChange={(e) => setClassification(e.target.value as Classification)}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
                    >
                      {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="type-label text-slate">Language</span>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
                    >
                      {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend className="type-label text-slate">Include Appendices</legend>
                  <div className="mt-1 grid gap-1 sm:grid-cols-3">
                    {Object.keys(appendices).map((k) => (
                      <label key={k} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={(appendices as Record<string, boolean>)[k]}
                          onChange={(e) => setAppendices({ ...appendices, [k]: e.target.checked })}
                          className="accent-[color:var(--color-teal)]"
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </PanelCard>

            {/* SH-4 preview */}
            <PanelCard>
              <PanelHead title="3. Preview Brief" meta="Live preview · what the recipient sees" />
              <div className="rounded-md border border-line bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold tracking-wider"
                    style={{ color: "#C0392B", backgroundColor: "#C0392B14" }}
                  >
                    {classification}
                  </span>
                  <button className="text-[11px] font-semibold text-[color:var(--color-blue)] hover:underline">
                    Preview Fullscreen ↗
                  </button>
                </div>
                <h3 className="text-[16px] font-extrabold text-[color:var(--color-navy)]">{title}</h3>
                <div className="mt-0.5 text-[11px] text-slate">
                  Investigation {inv.id} · {inv.vessel} · IMO {inv.imo} · {inv.flag}
                </div>
                <div className="mt-3">
                  <div className="type-label text-slate">Executive Summary</div>
                  <p className="mt-1 text-[13px] text-foreground/85">{summary}</p>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
                  <PreviewStat label="Risk" value={<RiskPill level={inv.risk} />} />
                  <PreviewStat label="Confidence" value={<span className="text-[14px] font-bold">{inv.confidencePct}%</span>} />
                  <PreviewStat label="Evidence" value={<span className="text-[14px] font-bold">14</span>} />
                  <PreviewStat label="Rules" value={<span className="text-[14px] font-bold">7</span>} />
                </div>
              </div>
            </PanelCard>

            {/* SH-5 recipients */}
            <PanelCard>
              <PanelHead title="4. Select Recipients" />
              <div className="grid gap-1.5 sm:grid-cols-2">
                {AGENCY_RECIPIENTS.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px]"
                  >
                    <input
                      type="checkbox"
                      checked={recipients.has(a.id)}
                      onChange={(e) => {
                        const next = new Set(recipients);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        setRecipients(next);
                      }}
                      className="accent-[color:var(--color-teal)]"
                    />
                    {a.name}
                  </label>
                ))}
              </div>
              <div className="mt-3">
                <label className="flex items-center gap-2 text-[12px] font-semibold text-[color:var(--color-blue)]">
                  <Plus className="h-3.5 w-3.5" /> Add External Recipient
                </label>
                <input
                  value={externalEmails}
                  onChange={(e) => setExternalEmails(e.target.value)}
                  placeholder="email@agency.gov.ng, secondperson@agency.gov.ng"
                  className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[12px] outline-none focus:border-[color:var(--color-teal)]"
                />
              </div>
            </PanelCard>
          </div>

          <aside className="space-y-4">
            {/* SH-6 Automatic Includes */}
            <PanelCard>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[color:var(--color-green)]" />
                <span className="type-h2 text-foreground">Every Export Automatically Includes</span>
              </div>
              <div className="type-small mt-1 text-slate">
                These items cannot be removed by the officer or the recipient.
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px]">
                {["Evidence", "Confidence", "Audit Trail", "Officer", "Timestamp"].map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--color-green)] text-white text-[10px]">✓</span>
                    <span className="text-foreground/85">{k}</span>
                  </li>
                ))}
              </ul>
            </PanelCard>

            {/* Delivery summary */}
            <PanelCard>
              <PanelHead title="Delivery Summary" />
              <dl className="space-y-1.5 text-[12px]">
                <SumRow label="Recipients" value={`${recipientCount}`} />
                <SumRow label="Method" value={output} />
                <SumRow label="Format" value={output.includes("Word") ? "DOCX" : "PDF"} />
                <SumRow label="Classification" value={classification} />
              </dl>
              <div className="mt-3 flex flex-col gap-2">
                <button className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[color:var(--color-navy)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[color:var(--color-navy)]/90">
                  <Lock className="h-3.5 w-3.5" /> Send &amp; Share Brief
                </button>
                <button className="rounded-md border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-foreground hover:bg-surface-2">
                  Save as Draft
                </button>
              </div>
              {/* SH-8 secure by design */}
              <div className="mt-3 rounded-md border border-line bg-surface-2/60 p-2 text-[11px] text-slate">
                <b className="text-foreground">Secure by Design.</b> All transmissions are encrypted and securely logged.
              </div>
            </PanelCard>

            {/* SH-9 recent shares */}
            <PanelCard>
              <PanelHead title="Recent Shares" meta="Last 4" />
              <ul className="divide-y divide-line">
                {RECENT_SHARES.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2 text-[12px]">
                    <div className="min-w-0 flex-1">
                      <div className="type-mono text-[11px] text-slate">{s.investigationId}</div>
                      <div className="truncate font-semibold text-foreground">{s.title}</div>
                      <div className="text-[11px] text-slate">{s.date}</div>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                      style={{ color: "#1E6B3A", backgroundColor: "#1E6B3A14" }}
                    >
                      SENT
                    </span>
                  </li>
                ))}
              </ul>
            </PanelCard>
            <ConfidenceChip tier="verified" />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function PreviewStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface-2/60 py-2">
      <div>{value}</div>
      <div className="type-label mt-0.5 text-slate">{label}</div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line/60 pb-1 last:border-0">
      <span className="type-label text-slate">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
