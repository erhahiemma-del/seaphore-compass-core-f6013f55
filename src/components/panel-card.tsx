import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Seaphore Card primitive.
 *
 * Surface: color.surface, 1px color.line, radius.lg, shadow.card.
 * Variants:
 *   default — pad = space.4 (16px)
 *   edge    — pad = 0 (for maps and immersive canvases)
 *   dark    — dark-mode centres (surface.dark)
 */
export interface PanelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "edge" | "dark";
  asChild?: boolean;
}

export const PanelCard = React.forwardRef<HTMLDivElement, PanelCardProps>(
  ({ variant = "default", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border elev-1",
          variant === "dark"
            ? "bg-[color:var(--color-surface)] border-[color:var(--color-line)] text-foreground"
            : "bg-surface border-line text-foreground",
          variant === "default" && "p-4",
          variant === "edge" && "p-0 overflow-hidden",
          variant === "dark" && "p-4",
          className,
        )}
        {...props}
      />
    );
  },
);
PanelCard.displayName = "PanelCard";
