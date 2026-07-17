import { useRef, useState } from "react";
import {
  Anchor,
  Building2,
  ChevronDown,
  Container,
  FileText,
  Hash,
  MapPin,
  Mic,
  Phone,
  Route as RouteIcon,
  Search,
  Ship,
  Sparkles,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mission Intelligence Command Bar (MIC-BAR)
 *
 * The primary interaction surface of the Seaphore platform.
 * Enterprise-grade unified search + entity shortcuts + AI copilot
 * + manifest ingestion — one horizontal command deck.
 */

interface EntityChip {
  key: string;
  label: string;
  icon: LucideIcon;
  token: string;
}

const ENTITY_CHIPS: EntityChip[] = [
  { key: "imo", label: "IMO", icon: Hash, token: "IMO:" },
  { key: "vessel", label: "Vessel", icon: Anchor, token: "vessel:" },
  { key: "company", label: "Company", icon: Building2, token: "company:" },
  { key: "manifest", label: "Manifest", icon: FileText, token: "manifest:" },
  { key: "container", label: "Container", icon: Container, token: "container:" },
  { key: "bol", label: "BOL", icon: Phone, token: "bol:" },
  { key: "voyage", label: "Voyage", icon: RouteIcon, token: "voyage:" },
  { key: "port", label: "Port", icon: MapPin, token: "port:" },
];

const ACCEPT =
  "application/pdf,image/jpeg,image/png,text/csv,text/xml,application/xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface CommandBarProps {
  className?: string;
  onSubmit?: (query: string) => void;
  onUpload?: (files: FileList) => void;
}

export function CommandBar({ className, onSubmit, onUpload }: CommandBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const insertToken = (token: string) => {
    setQuery((q) => (q.startsWith(token) ? q : `${token} ${q.replace(/^[a-z]+:\s*/i, "")}`.trim() + " "));
    inputRef.current?.focus();
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const f = files[0];
    setUploadName(f.name);
    setUploadProgress(0);
    onUpload?.(files);
    // Simulated progress — real ingestion pipeline lands in the Manifest sprint.
    let p = 0;
    const id = window.setInterval(() => {
      p += Math.random() * 22;
      if (p >= 100) {
        setUploadProgress(100);
        window.clearInterval(id);
        window.setTimeout(() => setUploadProgress(null), 900);
      } else {
        setUploadProgress(Math.round(p));
      }
    }, 220);
  };

  return (
    <section
      aria-label="Mission Intelligence Command Bar"
      className={cn(
        "flex flex-col gap-4 rounded-[22px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.04),0_8px_28px_-18px_rgba(11,31,58,0.18)] lg:flex-row lg:items-center lg:gap-5 lg:p-6",
        className,
      )}
    >
      {/* Section 1 — Search + Section 2 — Chips */}
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center text-[color:var(--color-navy)]">
          <Search className="h-6 w-6" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit?.(query.trim());
            }}
          >
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search IMO, Vessel, Company, Manifest, Container, Voyage…"
              className="w-full bg-transparent text-[20px] font-semibold leading-tight tracking-[-0.005em] text-[color:var(--color-navy)] placeholder:text-[#8A98A6] focus:outline-none"
              aria-label="Search or ask an intelligence question"
            />
          </form>
          <div className="mt-1 text-[14px] font-medium text-[#6B7280]">
            or ask an intelligence question in natural language
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {ENTITY_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => insertToken(c.token)}
                className={cn(
                  "inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--color-ink)]",
                  "motion-fast hover:border-[#BFD7FE] hover:bg-[#F5F9FF] hover:text-[color:var(--color-navy)]",
                )}
              >
                <c.icon className="h-3.5 w-3.5 text-[color:var(--color-slate)]" strokeWidth={2} />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3 — Voice + AI Copilot */}
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          aria-label="Voice search"
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[color:var(--color-ink)]",
            "motion-fast hover:border-[#BFD7FE] hover:shadow-[0_2px_10px_rgba(37,99,235,0.12)]",
          )}
        >
          <Mic className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-12 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-5 text-[14px] font-semibold text-[color:var(--color-navy)]",
            "motion-fast hover:border-[#BFD7FE] hover:bg-[#F5F9FF]",
          )}
        >
          <Sparkles className="h-4 w-4 text-[#2563EB]" strokeWidth={2.25} />
          AI Copilot
          <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-slate)]" strokeWidth={2.25} />
        </button>
      </div>

      {/* Section 4 — Upload Manifest */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn(
          "group relative flex h-[96px] w-full shrink-0 items-center gap-3 rounded-[16px] border border-[#E5E7EB] bg-white px-5 text-left lg:w-[280px]",
          "motion-fast hover:border-[#2563EB]/40 hover:shadow-[0_2px_14px_rgba(37,99,235,0.10)]",
        )}
        aria-label="Upload Manifest"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF4FF] text-[#2563EB]">
          <UploadCloud className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[color:var(--color-navy)]">
            {uploadName ?? "Upload Manifest"}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[#6B7280]">
            {uploadProgress !== null
              ? `Uploading… ${uploadProgress}%`
              : "PDF, JPG, PNG, Excel"}
          </div>
          {uploadProgress !== null && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#EEF2F7]">
              <div
                className="h-full bg-[#2563EB] motion-base"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={ACCEPT}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </button>
    </section>
  );
}
