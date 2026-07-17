import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "complete" | "active" | "pending";

export interface LifecycleStep {
  key: string;
  label: string;
  status: StepStatus;
}

/**
 * DS-1 / cross-stage lifecycle stepper.
 * Investigate → Decision Support → Share → Learn.
 */
export function LifecycleStepper({
  steps,
  className,
}: {
  steps: LifecycleStep[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-4 py-3 shadow-card",
        className,
      )}
    >
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
              step.status === "complete" &&
                "bg-[color:var(--color-green)] text-white",
              step.status === "active" &&
                "bg-[color:var(--color-teal)] text-white ring-4 ring-[color:var(--color-teal)]/15",
              step.status === "pending" &&
                "bg-surface-2 text-slate ring-1 ring-line",
            )}
          >
            {step.status === "complete" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={cn(
              "text-[12px] font-semibold",
              step.status === "active"
                ? "text-foreground"
                : "text-foreground/70",
            )}
          >
            {step.label}
          </span>
          {step.status !== "pending" && (
            <span className="text-[10px] uppercase tracking-[0.06em] text-slate">
              {step.status === "complete" ? "Complete" : "In Review"}
            </span>
          )}
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="mx-1 h-px w-8 bg-line sm:w-12"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
