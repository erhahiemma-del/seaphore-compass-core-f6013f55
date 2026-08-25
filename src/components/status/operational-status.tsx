/**
 * PHASE 2 — canonical operational status presentation.
 *
 * One visual treatment per operational meaning, everywhere. This component
 * asserts nothing: callers pass the state their own truth layer already
 * resolved (coverage model, provider health, projection contract). Colour is
 * never the only signal — every state carries a label and an icon.
 */
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  KeyRound,
  PlugZap,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Semantic tone — the only colour vocabulary status surfaces may use. */
export type StatusTone = "verified" | "active" | "review" | "critical" | "inactive";

/** Truthful operational states already used across the platform. */
export type OperationalState =
  | "VERIFIED"
  | "PARTIAL_COVERAGE"
  | "PROVIDER_AVAILABLE"
  | "AWAITING_CREDENTIALS"
  | "SOURCE_UNAVAILABLE"
  | "NO_DATA_RECEIVED"
  | "VERIFICATION_REQUIRED";

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  verified:
    "text-[color:var(--status-verified)] bg-[color:var(--status-verified-tint)] border-[color:var(--status-verified-edge)]",
  active:
    "text-[color:var(--status-active)] bg-[color:var(--status-active-tint)] border-[color:var(--status-active-edge)]",
  review:
    "text-[color:var(--status-review)] bg-[color:var(--status-review-tint)] border-[color:var(--status-review-edge)]",
  critical:
    "text-[color:var(--status-critical)] bg-[color:var(--status-critical-tint)] border-[color:var(--status-critical-edge)]",
  inactive:
    "text-[color:var(--status-inactive)] bg-[color:var(--status-inactive-tint)] border-[color:var(--status-inactive-edge)]",
};

export const STATUS_TONE_TEXT: Record<StatusTone, string> = {
  verified: "text-[color:var(--status-verified)]",
  active: "text-[color:var(--status-active)]",
  review: "text-[color:var(--status-review)]",
  critical: "text-[color:var(--status-critical)]",
  inactive: "text-[color:var(--status-inactive)]",
};

const STATE_META: Record<OperationalState, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  VERIFIED: { label: "Verified", tone: "verified", icon: BadgeCheck },
  PARTIAL_COVERAGE: { label: "Partial coverage", tone: "review", icon: CircleDashed },
  PROVIDER_AVAILABLE: { label: "Provider available", tone: "active", icon: PlugZap },
  AWAITING_CREDENTIALS: { label: "Awaiting credentials", tone: "review", icon: KeyRound },
  SOURCE_UNAVAILABLE: { label: "Source unavailable", tone: "inactive", icon: CircleSlash },
  NO_DATA_RECEIVED: { label: "No data received", tone: "inactive", icon: Clock },
  VERIFICATION_REQUIRED: { label: "Verification required", tone: "review", icon: ShieldQuestion },
};

export interface StatusChipProps {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
  /** Compact removes the icon for dense table cells; label always remains. */
  compact?: boolean;
  title?: string;
  className?: string;
}

/** Tone-driven chip for states the caller labels itself. */
export function StatusChip({
  tone,
  label,
  icon,
  compact = false,
  title,
  className,
}: StatusChipProps) {
  const Icon = icon ?? (tone === "critical" ? AlertTriangle : undefined);
  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5",
        "text-[10.5px] font-bold uppercase tracking-[0.06em] whitespace-nowrap",
        STATUS_TONE_CLASS[tone],
        className,
      )}
    >
      {!compact && Icon ? <Icon aria-hidden className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

/** Canonical rendering for one of the platform's truthful states. */
export function OperationalStatus({
  state,
  detail,
  compact,
  className,
}: {
  state: OperationalState;
  detail?: string;
  compact?: boolean;
  className?: string;
}) {
  const meta = STATE_META[state];
  return (
    <StatusChip
      tone={meta.tone}
      label={meta.label}
      icon={meta.icon}
      compact={compact}
      title={detail ?? meta.label}
      className={className}
    />
  );
}

/** Label/value pair used in institutional records (Context Rail, drawers). */
export function RecordField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-3 px-4 py-2", className)}>
      <dt className="type-colhead w-[42%] shrink-0 text-slate">{label}</dt>
      <dd className="min-w-0 flex-1 text-right">{children}</dd>
    </div>
  );
}
