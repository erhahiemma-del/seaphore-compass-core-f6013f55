/**
 * The command surface's actions.
 *
 * What the officer can do from the command bar, whether they are
 * permitted to, whether the thing it leads to exists, and which order a
 * given lens wants them in. Pure — destinations are intent, resolved to
 * routes by the host where the router can typecheck them.
 *
 * ## Three different reasons an action can be unavailable
 *
 * Kept apart because they need different answers from the officer:
 *
 *   permission-denied  You may not do this. Ask someone who can.
 *   not-built          Nothing to open yet. Nobody can do this.
 *   no-context         The action needs a subject and there is not one.
 *
 * Collapsing them into a greyed-out button teaches officers that the
 * whole row is decorative. Two of the reference's shortcuts genuinely
 * fall into `not-built`, and saying so is more useful than a control
 * that silently does nothing.
 */
import { can, type Permission, type Role } from "@/lib/permissions";
import type { MissionMode } from "@/features/mission-control/modes";

export type CommandActionId =
  | "investigate"
  | "upload-manifest"
  | "create-investigation"
  | "generate-report"
  | "decision-queue"
  | "review-approvals"
  | "evidence-packages"
  | "watchlist";

/** Primary actions sit beside the input; shortcuts sit in the row beneath. */
export type CommandActionGroup = "primary" | "shortcut";

export type CommandActionAvailability =
  | { readonly state: "ready" }
  | { readonly state: "permission-denied"; readonly permission: Permission }
  | { readonly state: "not-built"; readonly detail: string }
  | { readonly state: "no-context"; readonly detail: string };

export interface CommandAction {
  readonly id: CommandActionId;
  readonly label: string;
  /** Second line in the reference — what the action actually does. */
  readonly caption: string;
  readonly group: CommandActionGroup;
  readonly availability: CommandActionAvailability;
}

/**
 * Where an action leads. Intent, not route strings.
 *
 * Same reasoning as the Focus Workspace handoff: literal routes only
 * typecheck at the call site, so keeping them in the host means a
 * renamed route fails the build instead of shipping a dead control.
 */
export type CommandDestination =
  | { readonly kind: "investigate-new" }
  | { readonly kind: "investigate-case"; readonly id: string }
  | { readonly kind: "manifest" }
  | { readonly kind: "briefings" }
  | { readonly kind: "decision-queue" }
  | { readonly kind: "evidence" };

/** Permission each action is gated on, from the existing matrix. */
const ACTION_PERMISSION: Readonly<Record<CommandActionId, Permission>> = {
  investigate: "investigation.create",
  "create-investigation": "investigation.create",
  "upload-manifest": "evidence.add",
  "generate-report": "briefing.send",
  "decision-queue": "decision.submit",
  "review-approvals": "decision.submit",
  "evidence-packages": "entity.read",
  watchlist: "watchlist.configure",
};

/**
 * Actions with nothing to open.
 *
 * Established by the audit, not assumed. `Review Approvals` and
 * `Watchlist` appear in the reference design and have no route, no
 * surface and no count source anywhere in the application — the
 * reference's "3" badge on approvals has no store behind it, and
 * inventing one would be exactly the fabricated metric this system is
 * built to refuse.
 */
const NOT_BUILT: Readonly<Partial<Record<CommandActionId, string>>> = {
  "review-approvals": "No approvals surface exists yet",
  watchlist: "No watchlist surface exists yet",
};

const DEFINITIONS: readonly {
  id: CommandActionId;
  label: string;
  caption: string;
  group: CommandActionGroup;
}[] = [
  { id: "investigate", label: "Investigate", caption: "Search or subject", group: "primary" },
  {
    id: "upload-manifest",
    label: "Upload Manifest",
    caption: "OCR · Validate · Store",
    group: "primary",
  },
  {
    id: "create-investigation",
    label: "Create Investigation",
    caption: "New case · Assign · Track",
    group: "primary",
  },
  {
    id: "generate-report",
    label: "Generate Report",
    caption: "Custom · Export · Share",
    group: "primary",
  },
  {
    id: "decision-queue",
    label: "Open Decision Queue",
    caption: "Pending decisions",
    group: "shortcut",
  },
  {
    id: "review-approvals",
    label: "Review Approvals",
    caption: "Awaiting approval",
    group: "shortcut",
  },
  {
    id: "evidence-packages",
    label: "Evidence Packages",
    caption: "Linked evidence",
    group: "shortcut",
  },
  { id: "watchlist", label: "Watchlist", caption: "Monitored subjects", group: "shortcut" },
];

/**
 * Which actions each lens leads with.
 *
 * Reordering only. Every action is always present, whatever the lens —
 * hiding the decision queue because the officer is reading revenue is
 * how a pending decision goes unmade.
 */
const MODE_ACTION_PRIORITY: Readonly<Record<string, readonly CommandActionId[]>> = {
  "revenue-assurance": ["upload-manifest", "generate-report", "evidence-packages"],
  investigation: ["investigate", "create-investigation", "evidence-packages"],
  "port-intelligence": ["investigate", "upload-manifest"],
  "national-picture": ["investigate", "decision-queue", "generate-report"],
  "risk-compliance": ["investigate", "watchlist", "evidence-packages"],
  "decision-coordination": ["decision-queue", "review-approvals", "generate-report"],
  "vessel-operations": ["investigate", "evidence-packages"],
  "strategic-intelligence": ["generate-report", "evidence-packages"],
};

function availabilityOf(
  id: CommandActionId,
  roles: readonly Role[] | null,
): CommandActionAvailability {
  // Permission is checked before existence on purpose: an officer who may
  // not use a feature does not need to know whether it was built.
  const permission = ACTION_PERMISSION[id];
  if (!can(roles, permission)) return { state: "permission-denied", permission };

  const missing = NOT_BUILT[id];
  if (missing) return { state: "not-built", detail: missing };

  return { state: "ready" };
}

export interface CommandActionInput {
  readonly mode: MissionMode;
  readonly roles: readonly Role[] | null;
}

/**
 * Build the action list for a lens and an officer.
 *
 * Order within each group follows the lens; actions the lens does not
 * name keep their declared order behind those it does.
 */
export function buildCommandActions({ mode, roles }: CommandActionInput): readonly CommandAction[] {
  const priority = MODE_ACTION_PRIORITY[mode.id] ?? [];
  const rank = (id: CommandActionId) => {
    const index = priority.indexOf(id);
    return index === -1 ? priority.length + DEFINITIONS.findIndex((d) => d.id === id) : index;
  };

  return DEFINITIONS.map((d) => ({ ...d, availability: availabilityOf(d.id, roles) })).sort(
    (a, b) => {
      // Groups never interleave — primaries sit beside the input.
      if (a.group !== b.group) return a.group === "primary" ? -1 : 1;
      return rank(a.id) - rank(b.id);
    },
  );
}

/**
 * Where an action leads, given what the officer currently has.
 *
 * `investigate` is the contextual one. With an open case for the subject
 * it continues that case rather than opening a second investigation into
 * the same thing; with a subject or a query but no case it goes to the
 * investigation module to start one; with neither it still opens the
 * module, which is the discovery path.
 */
export function commandDestination(
  id: CommandActionId,
  context: { readonly openCaseId?: string | null } = {},
): CommandDestination | null {
  switch (id) {
    case "investigate":
      return context.openCaseId
        ? { kind: "investigate-case", id: context.openCaseId }
        : { kind: "investigate-new" };
    case "create-investigation":
      return { kind: "investigate-new" };
    case "upload-manifest":
      return { kind: "manifest" };
    case "generate-report":
      return { kind: "briefings" };
    case "decision-queue":
      return { kind: "decision-queue" };
    case "evidence-packages":
      return { kind: "evidence" };
    // Nothing to navigate to. Reported as not-built above.
    case "review-approvals":
    case "watchlist":
      return null;
  }
}

/**
 * Manifest ingestion capability, stated honestly.
 *
 * The adapter matrix marks `manifest_upload` and `google_vision` ACTIVE,
 * but the Google Vision adapter's own note says the real call lives in
 * `src/lib/ocr.functions.ts` "once wired", and that file does not exist.
 * `validateManifest` accepts a `manifest_id` for a manifest already in
 * the database — there is no path from a file to extracted fields.
 *
 * So the command action opens the manifest surface and says what it can
 * and cannot do. The alternative already exists on /command-center, where
 * "extraction" is derived from the uploaded file's *name length* and
 * invents bill-of-lading numbers, vessel names, consignees and ports.
 * That is precisely what must not be reproduced here.
 */
export const MANIFEST_INGESTION_AVAILABLE = false;

export const MANIFEST_INGESTION_DETAIL =
  "Document extraction is not connected. Manifests can be reviewed, not ingested from a file.";
