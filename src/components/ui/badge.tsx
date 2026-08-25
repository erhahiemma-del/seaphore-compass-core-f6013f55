import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Institutional badge. Semantic variants match the platform's status tones so
 * the same operational meaning looks identical on every surface.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-[color:var(--navy)] bg-[color:var(--navy)] text-white",
        secondary: "border-line bg-surface-2 text-slate",
        destructive:
          "border-[color:var(--status-critical-edge)] bg-[color:var(--status-critical-tint)] text-[color:var(--status-critical)]",
        outline: "border-line-strong bg-transparent text-foreground",
        verified:
          "border-[color:var(--status-verified-edge)] bg-[color:var(--status-verified-tint)] text-[color:var(--status-verified)]",
        active:
          "border-[color:var(--status-active-edge)] bg-[color:var(--status-active-tint)] text-[color:var(--status-active)]",
        review:
          "border-[color:var(--status-review-edge)] bg-[color:var(--status-review-tint)] text-[color:var(--status-review)]",
        inactive:
          "border-[color:var(--status-inactive-edge)] bg-[color:var(--status-inactive-tint)] text-[color:var(--status-inactive)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
