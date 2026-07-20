/**
 * DevModeBadge — small fixed "Development Mode" indicator shown whenever
 * the Development Preview bypass is active. Only mounted in dev builds
 * (see __root.tsx), so it is stripped from production entirely.
 */
import { FlaskConical } from "lucide-react";

import { useIsDevBypass, useDevModeStore } from "@/stores/dev-mode.store";

export function DevModeBadge() {
  const bypass = useIsDevBypass();
  const role = useDevModeStore((s) => s.mockRole);
  if (!bypass) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-4 top-4 z-[9999] flex items-center gap-1.5 rounded-full border border-amber-400/70 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-900 shadow-sm backdrop-blur dark:text-amber-100 print:hidden"
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      Development Mode
      <span className="rounded-full bg-amber-500/25 px-1.5 py-0.5 text-[9px] tracking-wide">
        {role}
      </span>
    </div>
  );
}
