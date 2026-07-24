/**
 * workspace/derive — pure functions that convert an AdaptiveBriefing into
 * workspace artifacts (evidence, tasks, hypotheses, entities, decisions,
 * timeline events, recommendations).
 *
 * Presentation/persistence only. No calls into OIE, ICE, IAL. This module
 * simply reads a briefing and appends to the active investigation.
 */
import type { AdaptiveBriefing } from "@/components/copilot/briefing/types";
import type {
  InvestigationWorkspace,
  WorkspacePriority,
} from "@/stores/workspace.store";
import { useWorkspaceStore } from "@/stores/workspace.store";
import {
  detectMissionType,
  getProfile,
} from "@/components/copilot/briefing/profiles";

function priorityFromTier(tier: "low" | "medium" | "high"): WorkspacePriority {
  if (tier === "high") return "HIGH";
  if (tier === "medium") return "MEDIUM";
  return "LOW";
}

/** Record a Copilot briefing into the active investigation workspace. */
export function recordBriefingToWorkspace(briefing: AdaptiveBriefing): string | null {
  const store = useWorkspaceStore.getState();
  let id = store.activeId;
  const missionType = briefing.missionType ?? detectMissionType(briefing);
  const profile = getProfile(missionType);

  if (!id) {
    id = store.createInvestigation({
      title: briefing.query.slice(0, 120),
      missionType,
      priority: priorityFromTier(briefing.classification.tier),
    });
  }
  const wid = id;

  // Ensure overview reflects latest briefing.
  useWorkspaceStore.getState().updateOverview(wid, {
    missionType,
    lastBriefingId: briefing.id,
  });

  // Conversation turn — copilot side.
  useWorkspaceStore.getState().appendConversation(wid, {
    role: "copilot",
    text: briefing.executive?.text ?? profile.badge,
    briefingId: briefing.id,
  });

  // Evidence.
  for (const ev of briefing.evidence ?? []) {
    useWorkspaceStore.getState().addEvidence(wid, {
      title: ev.title,
      source: ev.source,
      category: "COLLECTED",
      grade: ev.grade,
      summary: ev.summary,
      hash: ev.hash,
    });
  }

  // Intelligence gaps → pending evidence + tasks.
  for (const gap of briefing.intelligenceGaps ?? []) {
    useWorkspaceStore.getState().addEvidence(wid, {
      title: gap,
      source: "Pending collection",
      category: "PENDING",
    });
    useWorkspaceStore.getState().addTask(wid, {
      title: gap,
      priority: "HIGH",
      owner: "Officer",
      sourceCommand: "gap-collection",
    });
  }

  // Officer actions → tasks.
  for (const action of briefing.officerActions ?? []) {
    useWorkspaceStore.getState().addTask(wid, {
      title: action.label,
      priority: "MEDIUM",
      owner: "Officer",
    });
  }

  // Entities.
  for (const ent of briefing.entities ?? []) {
    useWorkspaceStore.getState().upsertEntity(wid, {
      id: ent.id,
      name: ent.name,
      type: ent.type,
      role: ent.role,
      riskTier: ent.riskTier,
    });
  }

  // Counter-hypotheses → hypotheses (Under Review).
  for (const h of briefing.counterHypotheses ?? []) {
    const state = useWorkspaceStore.getState().investigations[wid];
    if (!state?.hypotheses.some((x) => x.statement === h)) {
      useWorkspaceStore.getState().addHypothesis(wid, h);
    }
  }
  // Ensure at least one working hypothesis from the executive summary.
  const stateNow = useWorkspaceStore.getState().investigations[wid];
  if (stateNow && stateNow.hypotheses.length === 0 && briefing.executive?.text) {
    useWorkspaceStore.getState().addHypothesis(wid, briefing.executive.text.split(".")[0]);
  }

  // Decision record for the briefing itself.
  useWorkspaceStore.getState().addDecision(wid, {
    title: `${profile.badge} briefing generated`,
    detail: briefing.query,
  });

  // Recommendation.
  const rec = profile.recommendation?.(briefing);
  if (rec) {
    useWorkspaceStore.getState().setRecommendation(wid, {
      id: `rec_${briefing.id}`,
      label: rec,
      supportingEvidence: (briefing.evidence ?? []).map((e) => e.id),
    });
    useWorkspaceStore.getState().addTimelineEvent(wid, {
      kind: "recommendation",
      label: rec,
    });
  }

  return wid;
}

/** Record an officer question turn. Creates workspace if none active. */
export function recordOfficerTurn(text: string, defaultTitle?: string): string {
  const store = useWorkspaceStore.getState();
  let id = store.activeId;
  if (!id) {
    id = store.createInvestigation({ title: defaultTitle ?? text.slice(0, 120) });
  }
  useWorkspaceStore.getState().appendConversation(id, { role: "officer", text });
  return id;
}

export type { InvestigationWorkspace };
