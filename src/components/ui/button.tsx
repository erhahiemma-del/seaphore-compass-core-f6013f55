import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Institutional action hierarchy:
 *   default (primary, navy) → secondary → ghost/link (tertiary) → destructive.
 * Every variant reads from semantic tokens; no hard-coded colour.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12.5px] font-semibold cursor-pointer motion-fast transition-[background-color,border-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--navy)] text-white border border-[color:var(--navy)] hover:bg-[color:var(--navy-700)] hover:border-[color:var(--navy-700)]",
        destructive:
          "bg-[color:var(--status-critical)] text-white border border-[color:var(--status-critical)] hover:brightness-95",
        outline:
          "border border-line-strong bg-surface text-foreground hover:border-[color:var(--ocean)] hover:text-[color:var(--ocean)]",
        secondary:
          "border border-line bg-surface-2 text-foreground hover:border-line-strong hover:bg-surface-3",
        ghost: "text-slate hover:bg-surface-2 hover:text-foreground",
        link: "text-[color:var(--ocean)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-[11.5px]",
        lg: "h-9 px-5 text-[13px]",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
