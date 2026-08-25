/**
 * Level 2 — the contextual Focus Workspace.
 *
 * The bridge between Mission Control and the dedicated modules. It shows
 * what is known about the focused subject and offers the ways forward;
 * it is not a replacement for the modules themselves, and deliberately
 * cannot do their work.
 *
 * ## Structure only
 *
 * Phase 3 is behavioural. This renders with the existing semantic tokens
 * and the same plain treatment as the Context Rail, because the visual
 * pass is a later phase and anything decided here would be thrown away
 * or, worse, kept by accident. The `data-testid` landmarks are the
 * contract that survives that pass.
 *
 * ## It renders the model and decides nothing
 *
 * Which sections exist, which actions are permitted, and what order they
 * read in are all settled by `buildFocusWorkspace`. This file contains no
 * `can()` call, no case lookup and no fabricated fallback — a section
 * with nothing to show prints why, from the model's own reason code.
 */
import { useEffect } from "react";

import { cn } from "@/lib/utils";

import {
  FOCUS_UNAVAILABLE_LABELS,
  type FocusActionId,
  type FocusSection,
  type FocusSectionKey,
  type FocusWorkspaceModel,
} from "./model";

const KIND_LABEL: Record<string, string> = {
  vessel: "Vessel",
  port: "Port",
  cargo: "Cargo",
  company: "Company",
  "risk-event": "Risk Event",
  voyage: "Voyage",
  manifest: "Manifest",
  incident: "Incident",
  investigation: "Investigation",
};

const SECTION_LABEL: Record<FocusSectionKey, string> = {
  metadata: "Identity",
  work: "Work",
  evidence: "Evidence",
  relationships: "Relationships",
};

/** One labelled row. The only way a value reaches the screen. */
function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-1.5">
      <dt className="type-small w-[45%] shrink-0 text-slate">{label}</dt>
      <dd className="type-mono min-w-0 flex-1 text-right font-semibold text-foreground">{value}</dd>
    </div>
  );
}

/**
 * A section, or the explicit reason it is empty.
 *
 * The unavailable branch is the point of the component: it is not
 * possible to render this section as a zero, because the model never
 * produces one.
 */
function Section({
  sectionKey,
  section,
  children,
}: {
  readonly sectionKey: FocusSectionKey;
  readonly section: FocusSection<unknown>;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      data-testid={`focus-section-${sectionKey}`}
      data-state={section.state}
      className="border-t border-line py-2"
    >
      <h3 className="type-label px-4 pb-1 text-slate">{SECTION_LABEL[sectionKey]}</h3>
      {section.state === "unavailable" ? (
        <p
          data-testid={`focus-unavailable-${sectionKey}`}
          className="type-small px-4 uppercase tracking-[0.05em] text-slate"
        >
          {FOCUS_UNAVAILABLE_LABELS[section.reason]}
        </p>
      ) : (
        <dl>{children}</dl>
      )}
    </section>
  );
}

export function FocusWorkspace({
  model,
  open,
  onAction,
  className,
}: {
  readonly model: FocusWorkspaceModel | null;
  readonly open: boolean;
  /** The surface raises intent; navigation and dismissal are handled above. */
  readonly onAction: (id: FocusActionId) => void;
  readonly className?: string;
}) {
  // Escape closes the transient surface. It does not clear focus — the
  // subject stays in hand, which is the distinction the store draws.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      onAction("dismiss");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onAction]);

  if (!model || !open) return null;

  const { identity, actions, sectionOrder } = model;

  const renderSection = (key: FocusSectionKey) => {
    switch (key) {
      case "metadata":
        return (
          <Section key={key} sectionKey={key} section={model.metadata}>
            {model.metadata.state === "present" &&
              model.metadata.data.map((f) => <Row key={f.label} label={f.label} value={f.value} />)}
          </Section>
        );
      case "work":
        return (
          <Section key={key} sectionKey={key} section={model.work}>
            {model.work.state === "present" && (
              <>
                <Row label="Case" value={model.work.data.caseTitle} />
                <Row label="Stage" value={model.work.data.stage} />
                <Row label="Priority" value={model.work.data.priority} />
                <Row label="Opened by" value={model.work.data.openedBy} />
                {model.work.data.awaitingApproval > 0 && (
                  <Row label="Awaiting approval" value={String(model.work.data.awaitingApproval)} />
                )}
              </>
            )}
          </Section>
        );
      case "evidence":
        return (
          <Section key={key} sectionKey={key} section={model.evidence}>
            {model.evidence.state === "present" && (
              <>
                <Row label="Records" value={String(model.evidence.data.records)} />
                <Row label="Sources" value={String(model.evidence.data.sources)} />
              </>
            )}
          </Section>
        );
      case "relationships":
        return (
          <Section key={key} sectionKey={key} section={model.relationships}>
            {model.relationships.state === "present" && (
              <>
                <Row label="Related entities" value={String(model.relationships.data.related)} />
                <Row label="Relationship types" value={model.relationships.data.kinds.join(", ")} />
                {model.relationships.data.hasContradictions && (
                  <Row label="Conflicts" value="Contradictions recorded" />
                )}
              </>
            )}
          </Section>
        );
    }
  };

  return (
    <aside
      data-testid="focus-workspace"
      data-subject-kind={identity.kind}
      data-level={model.level}
      aria-label={`Focus workspace: ${identity.title}`}
      className={cn(
        "w-full shrink-0 rounded-lg border border-line bg-surface elev-2 lg:w-[320px]",
        className,
      )}
    >
      <header className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="type-label text-slate">{KIND_LABEL[identity.kind] ?? "Subject"}</div>
          <div data-testid="focus-title" className="type-title mt-0.5 truncate text-foreground">
            {identity.title}
          </div>
          {identity.descriptor && (
            <div className="type-mono mt-0.5 truncate text-slate">{identity.descriptor}</div>
          )}
        </div>
      </header>

      {sectionOrder.map(renderSection)}

      <footer className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            data-testid={`focus-action-${a.id}`}
            disabled={!a.enabled}
            title={a.disabledReason}
            onClick={() => onAction(a.id)}
            className={cn(
              "rounded border px-2 py-1 text-[11px] font-semibold motion-fast",
              a.enabled
                ? "border-line bg-surface-2 text-foreground hover:border-[color:var(--color-teal)]/45"
                : "cursor-not-allowed border-transparent text-slate opacity-60",
            )}
          >
            {a.label}
          </button>
        ))}
      </footer>
    </aside>
  );
}
