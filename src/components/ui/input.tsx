import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[13px] text-foreground motion-fast",
          "file:border-0 file:bg-transparent file:text-[12px] file:font-semibold file:text-foreground",
          "placeholder:text-slate/70 hover:border-[color:var(--ocean)]/45",
          "aria-invalid:border-[color:var(--status-critical)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
