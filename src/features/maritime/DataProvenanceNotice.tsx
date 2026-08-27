/**
 * What kind of data the officer is actually looking at.
 *
 * Simulated traffic moving along plausible approaches is
 * indistinguishable from the real thing by eye. That is what makes the
 * demonstration useful and exactly what makes it dangerous: an officer
 * who mistook it for the operational picture would be making judgements
 * about ships that do not exist. Right now the simulation can be
 * switched on and thirty-two vessels appear with nothing on screen
 * saying where they came from.
 *
 * This is that missing sentence. It is not a warning banner — a
 * demonstration environment that shouts at the officer on every screen
 * gets ignored within a day, and an ignored notice is worse than none
 * because it produces the habit of dismissing provenance. It is a quiet,
 * permanent statement of fact, in the place the map already keeps its
 * explanations of the current picture.
 *
 * ## It is derived, never declared
 *
 * The notice reads the enabled sources and asks each one what type it
 * is. Nothing here knows the simulation's name, and no component
 * anywhere carries a `isDemo` flag to be forgotten during a refactor.
 * Connect a real provider and this disappears on its own, because the
 * condition that produced it stopped being true — not because somebody
 * remembered to remove it.
 */
import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";
import { getVesselSource, useMapSelector, type SourceType } from "@/services/geospatial";

/**
 * What the officer is told, per kind of data on the map.
 *
 * Keyed by source type so a future provider class gets a statement by
 * being declared rather than by someone remembering to add a case. Only
 * kinds that need saying appear: a government or commercial feed is the
 * unremarkable case and says nothing, because a notice that appears
 * always carries no information.
 */
const NOTICE: Partial<Record<SourceType, { title: string; detail: string }>> = {
  SIMULATED: {
    title: "Demonstration data",
    detail: "Simulated vessel activity for system preview.",
  },
};

export function DataProvenanceNotice({ className }: { readonly className?: string }) {
  /*
   * Subscribed as a string rather than an array.
   *
   * `enabledSources` is a new array on every state write, so selecting it
   * directly would re-render this on every camera move. The joined form
   * changes only when the set does.
   */
  const enabledCsv = useMapSelector((state) => state.enabledSources.join(","));

  /*
   * The strongest claim any active source makes.
   *
   * A mixed picture must be described by its weakest data, not its best:
   * if any part of what is drawn is simulated, the officer needs to know
   * that before they trust any of it. So a single simulated source is
   * enough to raise the notice even alongside a real one.
   */
  const types = enabledCsv
    .split(",")
    .filter(Boolean)
    .map((id) => getVesselSource(id)?.describe().type)
    .filter((type): type is SourceType => Boolean(type));

  const notice = types.includes("SIMULATED") ? NOTICE.SIMULATED : undefined;
  if (!notice) return null;

  return (
    <div
      data-testid="data-provenance-notice"
      data-provenance="SIMULATED"
      className={cn(
        "pointer-events-auto w-full rounded-md border border-amber-500/40 bg-amber-50/90 px-2.5 py-1.5 backdrop-blur-sm",
        "dark:border-amber-400/30 dark:bg-amber-950/40",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <FlaskConical className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-800 dark:text-amber-300">
          {notice.title}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-amber-900/80 dark:text-amber-200/80">
        {notice.detail}
      </p>
    </div>
  );
}
