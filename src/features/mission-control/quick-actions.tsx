/**
 * Mission Control quick actions — presentation only.
 *
 * Every entry is a link to a route that already exists; nothing here owns
 * behaviour, state or data. Three primary action cards sit above a compact
 * shortcut row, matching the approved command-region composition.
 */
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  ChevronDown,
  FilePlus2,
  FileSignature,
  FolderArchive,
  Gavel,
  ListChecks,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";

type QuickAction = {
  readonly label: string;
  readonly hint: string;
  readonly to: LinkProps["to"];
  readonly icon: LucideIcon;
  /** Icon glyph + wash colours. Each primary action reads as its own family. */
  readonly iconClass?: string;
  readonly badge?: number;
};

const PRIMARY: readonly QuickAction[] = [
  {
    label: "Upload Manifest",
    hint: "OCR · Validate · Store",
    to: "/manifest",
    icon: Upload,
    iconClass: "bg-[#E6F6EF] text-[#0E9F6E]",
  },
  {
    label: "Create Investigation",
    hint: "New case · Assign · Track",
    to: "/investigate",
    icon: FilePlus2,
    iconClass: "bg-[#EEE9FE] text-[#7C3AED]",
  },
  {
    label: "Generate Report",
    hint: "Custom · Export · Share",
    to: "/share",
    icon: FileSignature,
    iconClass: "bg-[#FEF0E2] text-[#EA8010]",
  },
];

const SHORTCUTS: readonly QuickAction[] = [
  { label: "Open Decision Queue", hint: "Decision support", to: "/decide", icon: Gavel },
  {
    label: "Review Approvals",
    hint: "Awaiting sign-off",
    to: "/decide/queue",
    icon: ListChecks,
    badge: 3,
  },
  { label: "Evidence Packages", hint: "Evidence library", to: "/evidence", icon: FolderArchive },
  { label: "Watchlist", hint: "Compliance monitoring", to: "/compliance", icon: ShieldCheck },
];

export function QuickActions() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* One row per action: the label must always read in full — a truncated
          instruction is not an instruction. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {PRIMARY.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group flex h-[52px] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 shadow-[0_1px_2px_rgba(11,31,58,0.05)] motion-fast hover:-translate-y-px hover:border-[color:var(--ocean)]/50 hover:shadow-card"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.iconClass}`}
            >
              <a.icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight text-[color:var(--color-navy)]">
                {a.label}
              </span>
              <span className="block truncate text-[11px] font-medium text-slate">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate">
          Shortcuts
        </span>
        {SHORTCUTS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            title={a.hint}
            className="relative inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-[color:var(--color-navy)]/85 shadow-[0_1px_1px_rgba(11,31,58,0.04)] motion-fast hover:border-[color:var(--ocean)]/50 hover:text-[color:var(--color-navy)]"
          >
            <a.icon className="h-3.5 w-3.5 text-slate" strokeWidth={1.75} />
            {a.label}
            {a.badge !== undefined && (
              <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[color:var(--color-green)] px-[3px] text-[9px] font-bold text-white">
                {a.badge}
              </span>
            )}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("seaphore:open-goto-palette"))}
          className="inline-flex h-[30px] items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-[color:var(--color-navy)]/85 shadow-[0_1px_1px_rgba(11,31,58,0.04)] motion-fast hover:border-[color:var(--ocean)]/50"
        >
          More
          <ChevronDown className="h-3.5 w-3.5 text-slate" strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}
