/**
 * Mission Control quick actions — presentation only.
 *
 * Every entry is a link to a route that already exists; nothing here owns
 * behaviour, state or data. Secondary to the search, so they render as a
 * compact strip rather than a wall of cards.
 */
import { Link, type LinkProps } from "@tanstack/react-router";
import {
  CloudUpload,
  FileSignature,
  FilePlus2,
  FolderArchive,
  Gavel,
  ListChecks,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type QuickAction = {
  readonly label: string;
  readonly hint: string;
  readonly to: LinkProps["to"];
  readonly icon: LucideIcon;
};

const PRIMARY: readonly QuickAction[] = [
  { label: "Upload Manifest", hint: "OCR · validate · store", to: "/manifest", icon: CloudUpload },
  {
    label: "Create Investigation",
    hint: "New case · assign · track",
    to: "/investigate",
    icon: FilePlus2,
  },
  { label: "Generate Report", hint: "Draft · export · share", to: "/share", icon: FileSignature },
];

const SHORTCUTS: readonly QuickAction[] = [
  { label: "Open Decision Queue", hint: "Decision support", to: "/decide", icon: Gavel },
  { label: "Review Approvals", hint: "Awaiting sign-off", to: "/decide/queue", icon: ListChecks },
  { label: "Evidence Packages", hint: "Evidence library", to: "/evidence", icon: FolderArchive },
  { label: "Watchlist", hint: "Compliance monitoring", to: "/compliance", icon: ShieldCheck },
];

export function QuickActions() {
  return (
    <div className="flex flex-col gap-3">
      {/* One row per action: the label must always read in full — a truncated
          instruction is not an instruction. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PRIMARY.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2.5 elev-1 motion-fast hover:-translate-y-px hover:border-[color:var(--ocean)]/60 hover:shadow-card"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--ocean-050)] text-[color:var(--ocean)]">
              <a.icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {a.label}
              </span>
              <span className="block truncate type-small text-slate">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="type-label text-slate">Shortcuts</span>
        {SHORTCUTS.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            title={a.hint}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-foreground/80 motion-fast hover:border-[color:var(--ocean)]/50 hover:text-foreground"
          >
            <a.icon className="h-3.5 w-3.5 text-slate" strokeWidth={1.75} />
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
