import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Anchor,
  Archive,
  ChevronRight,
  Download,
  FileText,
  FileType2,
  Files,
  HelpCircle,
  Home,
  Lock,
  Mail,
  MessageCircle,
  Package,
  Plus,
  Printer,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import {
  AGENCY_RECIPIENTS,
  CLASSIFICATIONS,
  INVESTIGATIONS,
  LANGUAGES,
  RECENT_SHARES,
  SHARE_OUTPUTS,
  investigationById,
  type Classification,
  type Investigation,
  type Language,
  type OutputType,
} from "@/lib/lifecycle-data";

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence Briefing & Dissemination Workspace
// UI-only replacement per reference spec. Preserves existing services,
// permissions, audit logging, and export-envelope contracts wired elsewhere
// (SendShareGate / briefings.functions.ts).
// ─────────────────────────────────────────────────────────────────────────────

const OUTPUT_META: Record<
  OutputType,
  { icon: React.ElementType; sub: string; tone: string }
> = {
  "Generate Brief": { icon: FileText, sub: "Intelligence summary", tone: "#2563EB" },
  "Generate PDF": { icon: FileType2, sub: "Portable document", tone: "#C0392B" },
  "Generate Word": { icon: Files, sub: "Editable document", tone: "#1F4FAE" },
  "Intelligence Pack": { icon: Package, sub: "Complete case pack", tone: "#6D28D9" },
  Email: { icon: Mail, sub: "Secure email", tone: "#0F766E" },
  WhatsApp: { icon: MessageCircle, sub: "Secure message", tone: "#1E6B3A" },
  Print: { icon: Printer, sub: "Print document", tone: "#475569" },
  Archive: { icon: Archive, sub: "Save to archive", tone: "#B06A00" },
};

const AGENCY_META: Record<string, { tone: string; domain: string; initials: string }> = {
  CUSTOMS: { tone: "#0F5132", domain: "customs.gov.ng", initials: "NC" },
  NAVY: { tone: "#0F2A44", domain: "navy.mil.ng", initials: "NN" },
  MARINE_POLICE: { tone: "#1E3A8A", domain: "marinepolice.gov.ng", initials: "MP" },
  NPA: { tone: "#7C2D12", domain: "nigerianports.gov.ng", initials: "NPA" },
  NIMASA: { tone: "#1E6B3A", domain: "nimasa.gov.ng", initials: "NM" },
  EFCC: { tone: "#B91C1C", domain: "efcc.gov.ng", initials: "EF" },
  NDLEA: { tone: "#4B5563", domain: "ndlea.gov.ng", initials: "ND" },
};

export function SharePage() {
  const { id } = useParams({ from: "/share/$id" });
  return <ShareWorkspace fallbackId={id} />;
}

/** Default workspace: opens the first case ready to share. */
export function ShareDefault() {
  const inv =
    INVESTIGATIONS.find((i) => i.mission === "Revenue Assurance") ??
    INVESTIGATIONS[0];
  return <ShareWorkspace fallbackId={inv.id} />;
}

function ShareWorkspace({ fallbackId }: { fallbackId?: string } = {}) {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? fallbackId ?? INVESTIGATIONS[0].id;
  const inv = investigationById(id);

  // Reference brief metadata (mirrors the attached spec).
  const primarySubject = "MV Crimson Endeavour";
  const primaryImo = "9837456";
  const confidencePct = 82;

  const [output, setOutput] = useState<OutputType>("Generate Brief");
  const [title, setTitle] = useState("Revenue Leakage Brief – MV Crimson Endeavour");
  const [summary, setSummary] = useState(
    "Intelligence summary for potential under-declaration of cargo value, volume and type resulting in estimated revenue leakage.",
  );
  const [classification, setClassification] = useState<Classification>("OFFICIAL–SENSITIVE");
  const [language, setLanguage] = useState<Language>("English");
  const [appendices, setAppendices] = useState<Record<string, boolean>>({
    "Evidence List": true,
    "Full Timeline": true,
    "Supporting Documents": true,
  });
  const [recipients, setRecipients] = useState<Set<string>>(
    new Set(AGENCY_RECIPIENTS.map((a) => a.id)),
  );
  const [externalEmails, setExternalEmails] = useState("");
  const [attemptedSend, setAttemptedSend] = useState(false);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const { validExternal, invalidExternal } = useMemo(() => {
    const tokens = externalEmails
      .split(/[,\s;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const t of tokens) (EMAIL_RE.test(t) ? valid : invalid).push(t);
    return { validExternal: valid, invalidExternal: invalid };
  }, [externalEmails]);

  const recipientCount = recipients.size + validExternal.length;
  const noRecipients = recipientCount === 0;
  const hasInvalidEmail = invalidExternal.length > 0;
  const canSend = !noRecipients && !hasInvalidEmail;
  const showRecipientError = attemptedSend && noRecipients;
  const showEmailError = hasInvalidEmail && (attemptedSend || externalEmails.trim().length > 0);

  return (
    <AppShell title="Share" subtitle="Intelligence Briefing Workspace" mode="light">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
        <HeaderBar
          inv={inv}
          primarySubject={primarySubject}
          primaryImo={primaryImo}
          confidencePct={confidencePct}
        />

        {/* Breadcrumb + top-right utility icons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex items-center gap-1.5 text-[12px] text-slate">
            <Home className="h-3.5 w-3.5" />
            <Link to="/investigate" className="hover:text-foreground">
              Investigate
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/decide" className="hover:text-foreground">
              Decision Support
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-semibold text-[color:var(--color-blue,#2563eb)]">
              Share
            </span>
          </nav>
          <div className="flex items-center gap-2">
            <IconBtn title="Help">
              <HelpCircle className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Download">
              <Download className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Print">
              <Printer className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>

        {/* Three-column workspace */}
        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_340px]">
          {/* LEFT — Choose Output + Configure Briefing */}
          <aside className="space-y-4">
            <Card
              title="1. Choose Output"
              subtitle="Select how you want to generate and share this intelligence."
            >
              <div className="grid grid-cols-2 gap-2">
                {SHARE_OUTPUTS.map((o) => {
                  const meta = OUTPUT_META[o];
                  const Icon = meta.icon;
                  const active = output === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOutput(o)}
                      className={`flex flex-col items-start gap-1.5 rounded-md border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-[color:var(--color-blue,#2563eb)] bg-[color:var(--color-blue,#2563eb)]/5 ring-1 ring-[color:var(--color-blue,#2563eb)]/40"
                          : "border-line bg-white hover:bg-surface-2/60"
                      }`}
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${meta.tone}14`, color: meta.tone }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-[12.5px] font-semibold text-foreground">
                        {o}
                      </span>
                      <span className="text-[10.5px] text-slate">{meta.sub}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card
              title="2. Configure Briefing"
              subtitle="Customize your briefing before sharing."
            >
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Brief Title</FieldLabel>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-blue,#2563eb)] focus:ring-1 focus:ring-[color:var(--color-blue,#2563eb)]/30"
                  />
                </div>
                <div>
                  <FieldLabel>Summary</FieldLabel>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-blue,#2563eb)] focus:ring-1 focus:ring-[color:var(--color-blue,#2563eb)]/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>Classification</FieldLabel>
                    <select
                      value={classification}
                      onChange={(e) => setClassification(e.target.value as Classification)}
                      className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-[color:var(--color-blue,#2563eb)]"
                    >
                      {CLASSIFICATIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Language</FieldLabel>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                      className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-[color:var(--color-blue,#2563eb)]"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <FieldLabel>Include Appendices</FieldLabel>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {Object.keys(appendices).map((k) => (
                      <label
                        key={k}
                        className="flex items-center gap-1.5 text-[12px] text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={appendices[k]}
                          onChange={(e) =>
                            setAppendices({ ...appendices, [k]: e.target.checked })
                          }
                          className="h-3.5 w-3.5 accent-[color:var(--color-blue,#2563eb)]"
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </aside>

          {/* CENTER — Preview Brief */}
          <section className="space-y-4">
            <Card
              title="3. Preview Brief"
              subtitle="Review your intelligence before sharing."
              action={
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-[11.5px] font-semibold text-foreground hover:bg-surface-2/60"
                >
                  <span>↗</span> Preview Fullscreen
                </button>
              }
            >
              <div className="rounded-md border border-line bg-white p-6">
                {/* Brand row */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--color-navy,#0F2A44)] text-white">
                      <Anchor className="h-4 w-4" />
                    </span>
                    <div className="leading-tight">
                      <div className="text-[13px] font-extrabold tracking-wide text-[color:var(--color-navy,#0F2A44)]">
                        SEAPHORE
                      </div>
                      <div className="text-[8.5px] font-semibold uppercase tracking-[0.15em] text-slate">
                        Maritime Intelligence OS
                      </div>
                    </div>
                  </div>
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold tracking-wider"
                    style={{ color: "#C0392B", backgroundColor: "#C0392B14" }}
                  >
                    {classification}
                  </span>
                </div>

                <h3 className="text-[20px] font-extrabold leading-tight text-foreground">
                  {title.replace(/–.*$/, "").trim() || "Revenue Leakage Brief"}
                </h3>
                <div className="mt-0.5 text-[12.5px] text-slate">
                  {primarySubject} (IMO {primaryImo})
                </div>

                {/* Meta grid */}
                <div className="mt-4 grid grid-cols-4 gap-3 rounded-md border border-line bg-surface-2/40 p-3">
                  <PreviewMeta label="Investigation ID" value={inv.id} />
                  <PreviewMeta label="Mission" value={inv.mission} />
                  <PreviewMeta label="Date" value="May 27, 2026" />
                  <PreviewMeta label="Prepared By" value={inv.officer} sub="NIMASA Analyst" />
                </div>

                <div className="relative mt-5">
                  <div className="type-label text-slate">Executive Summary</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">
                    Analysis indicates potential under-declaration of cargo value, volume and type,
                    resulting in estimated revenue at risk. Key evidence and patterns are summarized below.
                  </p>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <PreviewStat
                      label="Risk Level"
                      value={
                        <span className="inline-flex items-center rounded bg-[#C0392B]/10 px-2 py-0.5 text-[11px] font-bold text-[#C0392B]">
                          HIGH
                        </span>
                      }
                    />
                    <PreviewStat
                      label="Confidence"
                      value={
                        <div className="flex items-center justify-center gap-1.5">
                          <ConfidenceRing pct={confidencePct} size={22} />
                          <span className="text-[13px] font-extrabold">{confidencePct}%</span>
                        </div>
                      }
                    />
                    <PreviewStat
                      label="Evidence Items"
                      value={<span className="text-[16px] font-extrabold">23</span>}
                    />
                    <PreviewStat
                      label="Rules Triggered"
                      value={<span className="text-[16px] font-extrabold">42</span>}
                    />
                  </div>

                  <div className="mt-5">
                    <div className="type-label text-slate">Key Finding</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">
                      Under-declaration of cargo value detected based on invoice comparison,
                      market reference data and historical patterns.
                    </p>
                  </div>

                  <div className="mt-4">
                    <div className="type-label text-slate">Estimated Revenue at Risk</div>
                    <div className="mt-1 text-[32px] font-extrabold leading-none text-foreground">
                      ₦18.6B
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-slate">
                      <span>
                        <b className="text-foreground">Expected:</b> ₦312.4M
                      </span>
                      <span>
                        <b className="text-foreground">Actual:</b> ₦293.8M
                      </span>
                      <span>
                        <b className="text-foreground">Recovered:</b> ₦18.6M
                      </span>
                    </div>
                  </div>

                  {/* Watermark anchor */}
                  <Anchor
                    aria-hidden
                    className="pointer-events-none absolute -right-2 bottom-0 h-40 w-40 text-slate/10"
                  />
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-line pt-3 text-[10.5px] text-slate">
                  <span>
                    This brief contains: <b className="text-foreground">23</b> evidence items,{" "}
                    <b className="text-foreground">42</b> rules,{" "}
                    <b className="text-foreground">11</b> documents,{" "}
                    <b className="text-foreground">8</b> data sources.
                  </span>
                  <span>Page 1 of 18</span>
                </div>
              </div>
            </Card>
          </section>

          {/* RIGHT — Recipients + Delivery + Recent + Secure */}
          <aside className="space-y-4">
            <Card
              title="4. Select Recipients"
              subtitle="Choose who will receive this briefing."
            >
              {showRecipientError && (
                <div
                  role="alert"
                  className="mb-2 rounded-md border border-[#C0392B]/40 bg-[#C0392B]/5 px-2.5 py-1.5 text-[11.5px] font-semibold text-[#C0392B]"
                >
                  Select at least one agency or add a valid external email.
                </div>
              )}
              <ul className="space-y-1.5">
                {AGENCY_RECIPIENTS.map((a) => {
                  const meta = AGENCY_META[a.id] ?? {
                    tone: "#475569",
                    domain: "",
                    initials: a.name.slice(0, 2).toUpperCase(),
                  };
                  const active = recipients.has(a.id);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-2.5 rounded-md border border-line bg-white px-2.5 py-2"
                    >
                    tone: "#475569",
                    domain: "",
                    initials: a.name.slice(0, 2).toUpperCase(),
                  };
                  const active = recipients.has(a.id);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-2.5 rounded-md border border-line bg-white px-2.5 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          const next = new Set(recipients);
                          if (e.target.checked) next.add(a.id);
                          else next.delete(a.id);
                          setRecipients(next);
                        }}
                        className="h-3.5 w-3.5 accent-[color:var(--color-blue,#2563eb)]"
                      />
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: meta.tone }}
                      >
                        {meta.initials}
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-[12.5px] font-semibold text-foreground">
                          {a.name}
                        </div>
                        <div className="truncate text-[10.5px] text-slate">
                          {meta.domain}
                        </div>
                      </div>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider"
                        style={{ color: "#1E6B3A", backgroundColor: "#1E6B3A14" }}
                      >
                        EMAIL
                      </span>
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded text-slate hover:bg-surface-2/60 hover:text-foreground"
                        title="Add contact"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3">
                <input
                  value={externalEmails}
                  onChange={(e) => setExternalEmails(e.target.value)}
                  placeholder="Add external recipient email"
                  className="mb-1.5 w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[color:var(--color-blue,#2563eb)]"
                />
                <button
                  type="button"
                  className="flex items-center gap-1 text-[12px] font-semibold text-[color:var(--color-blue,#2563eb)] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add External Recipient
                </button>
              </div>
            </Card>

            <Card
              title="5. Delivery Summary"
              subtitle="Review delivery details before sending."
            >
              <dl className="space-y-1.5 text-[12px]">
                <SumRow label="Recipients" value={`${recipientCount} organizations`} />
                <SumRow
                  label="Delivery Method"
                  value={output.includes("WhatsApp") ? "WhatsApp" : "Email"}
                />
                <SumRow
                  label="Output Format"
                  value={
                    output.includes("Word")
                      ? "Word Document"
                      : output.includes("Pack")
                        ? "Intelligence Pack"
                        : "PDF Brief"
                  }
                />
                <SumRow label="Classification" value={classification} />
              </dl>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[color:var(--color-blue,#2563eb)] px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-[color:var(--color-blue,#2563eb)]/90"
                >
                  <Send className="h-4 w-4" /> Send &amp; Share Brief
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 py-2.5 text-[13px] font-semibold text-foreground hover:bg-surface-2/60"
                >
                  <Save className="h-4 w-4" /> Save as Draft
                </button>
              </div>
            </Card>

            <Card
              title="Recent Shares"
              action="View all"
            >
              <ul className="divide-y divide-line">
                {RECENT_SHARES.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-mono text-[10.5px] text-slate">
                        {s.investigationId}
                      </div>
                      <div className="truncate text-[12px] font-semibold text-foreground">
                        {s.title}
                      </div>
                      <div className="text-[10.5px] text-slate">{s.date}</div>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider"
                      style={{ color: "#1E6B3A", backgroundColor: "#1E6B3A14" }}
                    >
                      SENT
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="flex items-start gap-2 rounded-lg border border-line bg-white p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1E6B3A]/10 text-[#1E6B3A]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="leading-snug">
                <div className="text-[12.5px] font-bold text-foreground">
                  Secure by Design
                </div>
                <div className="text-[11px] text-slate">
                  All transmissions are encrypted and securely logged.
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom — Every Export Automatically Includes */}
        <Card
          title="Every Export Automatically Includes"
          subtitle="These items are included in every export. Cannot be removed."
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                label: "Evidence",
                sub: "All evidence items with sources and references",
                icon: FileText,
                tone: "#1E6B3A",
              },
              {
                label: "Confidence",
                sub: "Confidence levels for findings and data",
                icon: ShieldCheck,
                tone: "#2563EB",
              },
              {
                label: "Audit Trail",
                sub: "Complete audit trail and activity log",
                icon: Files,
                tone: "#6D28D9",
              },
              {
                label: "Officer",
                sub: "Name and role of officer generating brief",
                icon: Lock,
                tone: "#B06A00",
              },
              {
                label: "Timestamp",
                sub: "Date and time of generation (WAT)",
                icon: ShieldCheck,
                tone: "#0F766E",
              },
            ].map((it) => (
              <div
                key={it.label}
                className="flex items-start gap-2.5 rounded-md border border-line bg-white p-3"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${it.tone}14`, color: it.tone }}
                >
                  <it.icon className="h-4 w-4" />
                </span>
                <div className="leading-tight">
                  <div className="text-[12.5px] font-bold text-foreground">
                    {it.label}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-slate">{it.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────
function HeaderBar({
  inv,
  primarySubject,
  primaryImo,
  confidencePct,
}: {
  inv: Investigation;
  primarySubject: string;
  primaryImo: string;
  confidencePct: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-white px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-[220px] flex-shrink-0">
          <h1 className="text-[22px] font-bold leading-tight text-foreground">
            Share
          </h1>
          <div className="text-[12.5px] font-semibold text-foreground/80">
            Share Intelligence &amp; Briefings
          </div>
          <div className="mt-0.5 text-[11px] text-slate">
            Securely generate and share intelligence with authorized recipients.
          </div>
        </div>

        <HeaderCell label="Mission" value={inv.mission} />
        <HeaderCell label="Investigation" value={inv.id} mono />
        <HeaderCell
          label="Primary Subject"
          value={
            <span>
              {primarySubject}
              <br />
              <span className="text-[11px] font-normal text-slate">
                IMO {primaryImo}
              </span>
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
              <span className="text-[13px] font-bold text-foreground">
                {confidencePct}%
              </span>
            </div>
          }
        />
        <HeaderCell
          label="Assigned Officer"
          value={
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-navy,#0F2A44)] text-[11px] font-bold text-white">
                {inv.officer
                  .split(" ")
                  .filter(Boolean)
                  .slice(-1)[0]
                  .charAt(0)}
              </span>
              <div className="leading-tight">
                <div className="text-[12.5px] font-semibold text-foreground">
                  {inv.officer}
                </div>
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
      <div
        className={`text-[13px] font-semibold text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────
function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
            )}
            {subtitle && (
              <div className="mt-0.5 text-[11.5px] text-slate">{subtitle}</div>
            )}
          </div>
          {typeof action === "string" ? (
            <button
              type="button"
              className="text-[12px] font-semibold text-[color:var(--color-blue,#2563eb)] hover:underline"
            >
              {action}
            </button>
          ) : (
            action
          )}
        </div>
      )}
      {children}
    </section>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-1 text-[11.5px] font-semibold text-foreground">
      {children}
      {required && <span className="ml-0.5 text-[#C0392B]">*</span>}
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-1.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate">
        {label}
      </span>
      <span className="text-right text-[12.5px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function PreviewMeta({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate">
        {label}
      </div>
      <div className="mt-0.5 text-[12.5px] font-semibold text-foreground">
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-slate">{sub}</div>}
    </div>
  );
}

function PreviewStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate">
        {label}
      </div>
      <div className="mt-1 flex items-center justify-center">{value}</div>
    </div>
  );
}

function IconBtn({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
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

function ConfidenceRing({ pct, size = 30 }: { pct: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} stroke="#E5E7EB" strokeWidth="3" fill="none" />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        stroke="#1E6B3A"
        strokeWidth="3"
        fill="none"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  );
}
