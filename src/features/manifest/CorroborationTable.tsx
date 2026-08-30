/**
 * A manifest's declared values beside what Datalastic observed.
 *
 * ## Why the table shows every field, including the ones it could not check
 *
 * The tempting design is a list of discrepancies. It is also the wrong one:
 * a table of four mismatches tells an officer nothing about how much was
 * actually verified, and thirteen fields that could not be checked look
 * identical to thirteen that passed. So every field appears, and the ones
 * that could not be settled say why.
 *
 * ## Why there is no verdict
 *
 * No summary badge, no score, no approve button. Approval is an officer's
 * decision recorded against their name; a component that computed one would
 * turn a set of observations into a judgement nobody made, and the officer
 * would be signing off on arithmetic rather than evidence.
 */
import { cn } from "@/lib/utils";
import type {
  ComparisonStatus,
  FieldComparison,
} from "@/services/manifest/datalastic-corroboration";

/**
 * How each status reads, and how hard it presses.
 *
 * `MISMATCH` and `CONFLICT` are the only two that colour as problems, and
 * they are different problems: a mismatch is the manifest disagreeing with
 * the provider, a conflict is the manifest disagreeing with itself. The
 * rest are shades of "not established", which must not look like passing
 * and must not look like failing.
 */
const STATUS: Record<ComparisonStatus, { label: string; className: string }> = {
  MATCH: {
    label: "Match",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  CLOSE_MATCH: {
    label: "Close match",
    className: "bg-emerald-500/10 text-emerald-700/80 dark:text-emerald-400/80",
  },
  MISMATCH: {
    label: "Mismatch",
    className: "bg-destructive/10 text-destructive",
  },
  CONFLICT: {
    label: "Conflict",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  NO_SOURCE_DATA: {
    label: "No source data",
    className: "bg-muted text-muted-foreground",
  },
  NOT_VERIFIABLE: {
    label: "Not verifiable",
    className: "bg-muted text-muted-foreground",
  },
};

function Cell({ value }: { value: string | null }) {
  return value ? (
    <span className="text-foreground">{value}</span>
  ) : (
    // An em dash, not an empty cell: a blank looks like a rendering fault.
    <span className="text-muted-foreground">—</span>
  );
}

export function CorroborationTable({
  rows,
  className,
}: {
  rows: readonly FieldComparison[];
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-2 text-[11.5px] text-muted-foreground">
        No manifest is linked to this vessel, so there is nothing to check. This says nothing about
        whether a manifest was filed.
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)} data-testid="corroboration-table">
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Field</th>
            <th className="py-1.5 pr-3 font-medium">Submitted</th>
            <th className="py-1.5 pr-3 font-medium">Datalastic</th>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 font-medium">Basis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className="border-b border-border/40 align-top last:border-0">
              <td className="py-1.5 pr-3 font-medium text-foreground">{row.field}</td>
              <td className="py-1.5 pr-3">
                <Cell value={row.submitted} />
              </td>
              <td className="py-1.5 pr-3">
                <Cell value={row.source} />
              </td>
              <td className="py-1.5 pr-3">
                <span
                  className={cn(
                    "inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    STATUS[row.status].className,
                  )}
                >
                  {STATUS[row.status].label}
                </span>
              </td>
              {/*
                Source, timestamp and reason share a cell. An officer
                disputing a row needs all three together — which endpoint
                said it, when, and why the comparison landed where it did.
              */}
              <td className="py-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                <span className="block">{row.reason}</span>
                {row.sourceRef ? (
                  <span className="block font-mono text-[10px]">
                    {row.sourceRef}
                    {row.timestamp ? ` · ${row.timestamp.slice(0, 16).replace("T", " ")} UTC` : ""}
                  </span>
                ) : null}
                <span className="block">Confidence {row.confidence.toLowerCase()}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
