/**
 * EIE · Copilot facade.
 *
 * Answers entity-shaped officer questions from the Entity Registry —
 * profile, ownership, related companies, connected containers, manifest
 * history, investigation history. The facade never invents an answer: an
 * unevidenced question returns a stated gap.
 *
 * OIE / IBE remain the only response authority. This module supplies the
 * evidence-backed material those layers render.
 */
import type { EntityRegistry } from "./registry";
import { buildEntityProfile } from "./profile";
import type {
  EieEntity,
  EieInvestigationLink,
  EieRelationshipType,
  EieTimelineEvent,
} from "./types";
import { weakestGrade } from "./types";
import type { EvidenceGrade } from "@/services/ial/types";

export type EntityQuestionIntent =
  | "entity-profile"
  | "owner"
  | "related-companies"
  | "connected-containers"
  | "manifest-history"
  | "investigation-history"
  | "timeline"
  | "unknown";

export interface EntityAnswer {
  readonly intent: EntityQuestionIntent;
  readonly subject: EieEntity | null;
  readonly headline: string;
  readonly lines: ReadonlyArray<string>;
  readonly citations: ReadonlyArray<string>;
  readonly grade: EvidenceGrade;
  readonly gaps: ReadonlyArray<string>;
  readonly nextActions: ReadonlyArray<string>;
}

const INTENT_PATTERNS: ReadonlyArray<{ intent: EntityQuestionIntent; re: RegExp }> = [
  { intent: "owner", re: /\b(owner|ownership|who owns|beneficial owner|manager)\b/i },
  { intent: "related-companies", re: /\b(related|connected|linked)\s+(compan|corporate|firm)/i },
  { intent: "connected-containers", re: /\b(container|containers|box(es)?)\b/i },
  { intent: "manifest-history", re: /\b(manifest|bill of lading|b\/l|bol)\b/i },
  {
    intent: "investigation-history",
    re: /\b(investigation|case|enforcement)\s*(history|record)?\b/i,
  },
  { intent: "timeline", re: /\b(timeline|history|chronolog|activity)\b/i },
  { intent: "entity-profile", re: /\b(profile|show|summary|who is|what is|dossier)\b/i },
];

export function classifyEntityQuestion(prompt: string): EntityQuestionIntent {
  for (const { intent, re } of INTENT_PATTERNS) {
    if (re.test(prompt)) return intent;
  }
  return "unknown";
}

/** Resolve the subject of a question against the registry. */
export function resolveSubject(
  registry: EntityRegistry,
  prompt: string,
  stickyFocusId?: string | null,
): EieEntity | null {
  const idMatch = prompt.match(/\b[a-z-]+:[a-z0-9-]+:[A-Za-z0-9:_-]+/);
  if (idMatch) {
    const direct = registry.get(idMatch[0]);
    if (direct) return direct;
  }
  const imo = prompt.match(/\b\d{7}\b/);
  if (imo) {
    const hit = registry.get(`vessel:imo:${imo[0]}`) ?? registry.search(imo[0])[0];
    if (hit) return hit;
  }
  const container = prompt.match(/\b[A-Z]{4}\d{7}\b/);
  if (container) {
    const hit = registry.get(`cargo:container:${container[0]}`) ?? registry.search(container[0])[0];
    if (hit) return hit;
  }
  // Longest quoted or capitalised phrase, then free-text search.
  const quoted = prompt.match(/"([^"]{3,})"/);
  const terms = [
    quoted?.[1],
    ...prompt
      .split(/[?.,;]/)
      .map((s) => s.replace(/^(show|open|give me|what is|who is|tell me about)\s+/i, "").trim())
      .filter((s) => s.length >= 3),
  ].filter(Boolean) as string[];
  for (const t of terms) {
    const hit = registry.search(t, { limit: 1 })[0];
    if (hit) return hit;
  }
  return stickyFocusId ? (registry.get(stickyFocusId) ?? null) : null;
}

function relLines(
  registry: EntityRegistry,
  entity: EieEntity,
  types: ReadonlyArray<EieRelationshipType>,
): { lines: string[]; citations: string[]; grades: EvidenceGrade[] } {
  const lines: string[] = [];
  const citations: string[] = [];
  const grades: EvidenceGrade[] = [];
  for (const { relationship, entity: other } of registry.neighbours(entity.id)) {
    if (types.length > 0 && !types.includes(relationship.type)) continue;
    lines.push(
      `${relationship.type.replace(/_/g, " ")} · ${other.label} (${other.type}) — ${relationship.explanation} [${relationship.grade}]`,
    );
    citations.push(...relationship.evidenceIds);
    grades.push(relationship.grade);
  }
  return { lines, citations, grades };
}

function timelineLines(events: ReadonlyArray<EieTimelineEvent>): string[] {
  return events.slice(-12).map((e) => `${e.at} · ${e.label} — ${e.description} [${e.grade}]`);
}

export interface AnswerOptions {
  readonly stickyFocusId?: string | null;
  readonly investigations?: ReadonlyArray<EieInvestigationLink>;
}

export function answerEntityQuestion(
  registry: EntityRegistry,
  prompt: string,
  opts: AnswerOptions = {},
): EntityAnswer {
  const intent = classifyEntityQuestion(prompt);
  const subject = resolveSubject(registry, prompt, opts.stickyFocusId);

  if (!subject) {
    return {
      intent,
      subject: null,
      headline: "No entity in the registry matches that question.",
      lines: [],
      citations: [],
      grade: "UNKNOWN",
      gaps: [
        "No evidence has been acquired for that entity in this session — run an intelligence query first.",
      ],
      nextActions: ["Acquire evidence for the entity", "Search the Entity Registry"],
    };
  }

  const profile = buildEntityProfile(registry, subject.id, {
    investigations: opts.investigations,
  })!;

  let lines: string[] = [];
  let citations: string[] = [];
  let grades: EvidenceGrade[] = [subject.grade];
  let headline = `${subject.label} — ${subject.type.replace(/-/g, " ")}`;

  switch (intent) {
    case "owner": {
      const r = relLines(registry, subject, ["owns", "manages", "operates"]);
      lines = r.lines;
      citations = r.citations;
      grades = r.grades.length ? r.grades : grades;
      headline = `Ownership and control of ${subject.label}`;
      break;
    }
    case "related-companies": {
      const r = relLines(registry, subject, [
        "owns",
        "manages",
        "operates",
        "associated_with",
        "director_of",
        "shipped_by",
      ]);
      lines = r.lines;
      citations = r.citations;
      grades = r.grades.length ? r.grades : grades;
      headline = `Companies connected to ${subject.label}`;
      break;
    }
    case "connected-containers": {
      const r = relLines(registry, subject, ["stows", "covers", "carried"]);
      lines = r.lines.filter((l) => l.includes("container") || l.includes("stows"));
      citations = r.citations;
      grades = r.grades.length ? r.grades : grades;
      headline = `Containers connected to ${subject.label}`;
      break;
    }
    case "manifest-history": {
      const r = relLines(registry, subject, ["declared_on", "covers", "consigned_to"]);
      lines = r.lines;
      citations = r.citations;
      grades = r.grades.length ? r.grades : grades;
      headline = `Manifest and bill-of-lading history for ${subject.label}`;
      break;
    }
    case "investigation-history": {
      lines = profile.investigations.map(
        (i) =>
          `${i.title}${i.status ? ` · ${i.status}` : ""}${i.updatedAt ? ` · ${i.updatedAt}` : ""}`,
      );
      headline = `Investigation history for ${subject.label}`;
      break;
    }
    case "timeline": {
      lines = timelineLines(profile.timeline);
      citations = profile.timeline.flatMap((e) => e.evidenceIds);
      grades = profile.timeline.map((e) => e.grade);
      headline = `Timeline for ${subject.label}`;
      break;
    }
    default: {
      lines = [
        ...profile.summary,
        ...relLines(registry, subject, []).lines.slice(0, 8),
        ...timelineLines(profile.timeline).slice(-5),
      ];
      citations = profile.evidence.map((e) => e.evidenceId);
      break;
    }
  }

  const gaps =
    lines.length === 0
      ? [`No evidence answers this question for ${subject.label}.`, ...profile.gaps]
      : profile.gaps;

  return {
    intent,
    subject,
    headline,
    lines,
    citations: Array.from(new Set(citations)).sort(),
    grade: weakestGrade(grades.length ? grades : [subject.grade]),
    gaps,
    nextActions: [
      `Open the entity profile for ${subject.label}`,
      "Explore the knowledge graph around this entity",
      "Attach this entity to an investigation",
    ],
  };
}
