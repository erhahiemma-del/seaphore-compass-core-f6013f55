import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[64px] w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[13px] text-foreground motion-fast placeholder:text-slate/70 hover:border-[color:var(--ocean)]/45 aria-invalid:border-[color:var(--status-critical)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
