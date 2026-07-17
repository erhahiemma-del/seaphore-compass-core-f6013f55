import { useRef, useState } from "react";
import {
  Anchor,
  Building2,
  ChevronDown,
  CloudUpload,
  FileText,
  Hash,
  MapPin,
  Mic,
  Package,
  Receipt,
  Route as RouteIcon,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mission Intelligence Command Bar — the single primary entry point
 * for Mission Control. Replaces the header search and combines:
 * global search, natural-language query, voice, AI Copilot,
 * manifest upload, and entity shortcuts.
 */

interface Chip {
  key: string;
  label: string;
  icon: LucideIcon;
}

const CHIPS: Chip[] = [
  { key: "imo", label: "IMO", icon: Hash },
  { key: "vessel", label: "Vessel", icon: Anchor },
  { key: "company", label: "Company", icon: Building2 },
  { key: "manifest", label: "Manifest", icon: FileText },
  { key: "container", label: "Container", icon: Package },
  { key: "bol", label: "BOL", icon: Receipt },
  { key: "voyage", label: "Voyage", icon: RouteIcon },
  { key: "port", label: "Port", icon: MapPin },
];

export function MissionCommandBar() {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section
      aria-label="Mission Intelligence Command Bar"
      className="grid gap-5 rounded-2xl border border-line bg-surface p-7 shadow-card lg:grid-cols-[minmax(0,1fr)_auto]"
    >
      {/* Search + chips column */}
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-start gap-5 pl-2">
          <Search
            className="mt-1 h-7 w-7 shrink-0 text-slate"
            strokeWidth={1.75}
          />
          <div className="min-w-0 flex-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search IMO, Vessel, Company, Manifest, Container, Voyage…"
              className={cn(
                "w-full bg-transparent text-[20px] font-semibold leading-tight tracking-tight text-[color:var(--color-navy)] outline-none",
                "placeholder:font-semibold placeholder:text-[color:var(--color-navy)]/40",
              )}
              aria-label="Mission intelligence search"
            />
            <div className="mt-2 text-[14px] text-slate">
              or ask an intelligence question in natural language
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <VoiceButton />
            <CopilotButton />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-2">
          {CHIPS.map((c) => {
            const Icon = c.icon;
            const active = activeChip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() =>
                  setActiveChip((prev) => (prev === c.key ? null : c.key))
                }
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
                  active
                    ? "border-[color:var(--color-blue)]/60 bg-[color:var(--color-blue)]/8 text-[color:var(--color-blue)]"
                    : "border-line/70 bg-surface text-foreground/70 hover:-translate-y-px hover:border-[color:var(--color-blue)]/40 hover:bg-[color:var(--color-blue)]/5 hover:text-[color:var(--color-blue)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upload manifest card */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn(
          "group flex min-w-[260px] items-center gap-4 rounded-xl border border-line bg-surface-2/40 p-5 text-left transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-[color:var(--color-blue)]/60 hover:bg-[color:var(--color-blue)]/5 hover:shadow-pop",
        )}
      >
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]",
            "transition-colors duration-200 group-hover:bg-[color:var(--color-blue)]/15",
          )}
        >
          <CloudUpload className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold text-[color:var(--color-navy)]">
            Upload Manifest
          </span>
          <span className="mt-0.5 text-[12px] text-slate">
            Drag &amp; Drop or PDF · Excel · JPG · PNG
          </span>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
          className="hidden"
        />
      </button>
    </section>
  );
}

function VoiceButton() {
  return (
    <button
      type="button"
      aria-label="Voice search"
      className={cn(
        "group flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface",
        "text-slate transition-all duration-200",
        "hover:-translate-y-px hover:scale-[1.04] hover:border-[color:var(--color-blue)]/60 hover:text-[color:var(--color-blue)] hover:shadow-card",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]/40",
      )}
    >
      <Mic className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}

function CopilotButton() {
  return (
    <button
      type="button"
      className={cn(
        "group inline-flex h-12 items-center gap-2 rounded-full border px-4",
        "border-[color:var(--color-blue)]/25 bg-[color:var(--color-blue)]/5",
        "text-[13px] font-semibold text-[color:var(--color-navy)] transition-all duration-200",
        "hover:-translate-y-px hover:border-[color:var(--color-blue)]/50 hover:bg-[color:var(--color-blue)]/10 hover:shadow-[0_0_0_4px_rgba(59,130,246,0.08)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]/40",
      )}
    >
      <Sparkles
        className="h-4 w-4 text-[color:var(--color-blue)]"
        strokeWidth={2}
      />
      AI Copilot
      <ChevronDown className="h-3.5 w-3.5 text-slate" strokeWidth={2} />
    </button>
  );
}
