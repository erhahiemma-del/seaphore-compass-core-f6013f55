import { Ship, Target, User, Activity } from "lucide-react";

import { ConfidenceChip, type ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { RiskPill, type RiskLevel } from "@/components/intelligence/RiskPill";
import { cn } from "@/lib/utils";

/**
 * NAV-6: Case header bar — REQUIRED on Investigate, Decision Support,
 * and Share screens. Maintains investigation context across the
 * lifecycle so an officer always knows which case, vessel, and mission
 * they are acting on.
 */
export interface CaseHeaderBarProps {
  investigationId: string;
  vessel?: string;
  mission?: string;
  officer?: string;
  status?: string;
  risk?: RiskLevel;
  confidence?: ConfidenceTier;
  className?: string;
}

export function CaseHeaderBar({
  investigationId,
  vessel,
  mission,
  officer,
  status,
  risk,
  confidence,
  className,
}: CaseHeaderBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-card px-6 py-3",
        className,
      )}
      role="region"
      aria-label="Case header"
    >
      <div className="flex flex-col">
        <span className="type-label text-slate">Investigation</span>
        <span className="type-mono text-[13px] font-semibold text-foreground">
          {investigationId}
        </span>
      </div>

      {vessel && <Field icon={Ship} label="Vessel" value={vessel} mono />}
      {mission && <Field icon={Target} label="Mission" value={mission} />}
      {officer && <Field icon={User} label="Officer" value={officer} />}
      {status && <Field icon={Activity} label="Status" value={status} />}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {risk && <RiskPill level={risk} />}
        {confidence && <ConfidenceChip tier={confidence} />}
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="type-label text-slate">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-[13px] text-foreground",
          mono && "type-mono font-semibold",
        )}
      >
        <Icon className="h-3.5 w-3.5 text-slate" />
        {value}
      </span>
    </div>
  );
}
