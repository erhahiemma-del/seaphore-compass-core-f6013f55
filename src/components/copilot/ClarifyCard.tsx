/**
 * ClarifyCard — a lightweight, non-briefing turn the OIE returns when
 * the officer's request is ambiguous (typically a bare entity mention
 * like "Tell me about Ocean Pearl"). Renders the clarification
 * question plus the operational-skill options as one-click chips so
 * the officer picks a line of enquiry without retyping.
 */
import { Button } from "@/components/ui/button";
import type { Clarification } from "@/services/oie";

export interface ClarifyCardProps {
  clarification: Clarification;
  onPick: (label: string) => void;
}

const QUERY_TEMPLATES: Record<string, (subject: string) => string> = {
  manifest_investigation: (s) => `Review the manifest for ${s}`,
  cargo_investigation: (s) => `Inspect cargo for ${s}`,
  ownership_investigation: (s) => `Who owns ${s}`,
  compliance_review: (s) => `Compliance review for ${s}`,
  voyage_comparison: (s) => `Compare voyage history for ${s}`,
  revenue_leakage: (s) => `Revenue leakage assessment for ${s}`,
  executive_briefing: (s) => `Executive briefing on ${s}`,
};

export function ClarifyCard({ clarification, onPick }: ClarifyCardProps) {
  const subject = clarification.anchor?.value;
  function composeQuery(optionId: string, label: string): string {
    if (!subject) return label;
    const tmpl = QUERY_TEMPLATES[optionId];
    return tmpl ? tmpl(subject) : `${label} for ${subject}`;
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Copilot · needs one detail
      </p>
      <p className="mt-2 text-sm text-foreground">{clarification.question}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {clarification.options.map((o) => (
          <li key={o.id}>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onPick(composeQuery(o.id, o.label))}
              title={o.hint}
            >
              {o.label}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        Pick one to continue — Copilot will carry the subject forward.
      </p>
    </div>
  );
}
