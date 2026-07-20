import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  AnalyticalAssessment,
  CounterHypotheses,
  CriticalFindings,
  DecisionImpact,
  DecisionRequired,
  EvidenceSourcesPanel,
  ExecutiveAssessment,
  HumanOverrideBar,
  IntelligenceGaps,
  NextQuestions,
  OfficerActions,
} from "./sections";
import type { OverrideDecision } from "./types";

const meta: Meta = { title: "Copilot/Briefing/Sections" };
export default meta;

export const Executive: StoryObj = {
  render: () => <ExecutiveAssessment text="Executive assessment sample text." />,
};

export const Findings: StoryObj = {
  render: () => (
    <CriticalFindings
      findings={[
        { id: "1", priority: "immediate", title: "Immediate action needed", grade: "VERIFIED", source: "OFAC" },
        { id: "2", priority: "today", title: "Review by end of day", grade: "CORROBORATED", source: "Broker chat" },
      ]}
    />
  ),
};

export const Analytical: StoryObj = {
  render: () => (
    <AnalyticalAssessment
      text="Circumstantial link is credible but does not meet enforcement threshold."
      whyChain={[
        { step: "1", from: "A", to: "B" },
        { step: "2", from: "B", to: "C" },
      ]}
    />
  ),
};

export const Counters: StoryObj = {
  render: () => <CounterHypotheses list={["Namesake collision", "Expired directorship"]} />,
};

export const Gaps: StoryObj = {
  render: () => (
    <IntelligenceGaps
      gaps={["Passport confirmation", "Beneficial-ownership percentage"]}
    />
  ),
};

export const Impact: StoryObj = {
  render: () => (
    <DecisionImpact impact={{ revenue: 0.15, security: 0.72, operational: 0.4, cargo: 0.3 }} />
  ),
};

export const Required: StoryObj = {
  render: () => (
    <DecisionRequired decision={{ deadline: "2026-07-24T18:00:00Z", risk: "Medium" }} />
  ),
};

export const Actions: StoryObj = {
  render: () => {
    const [accepted, setAccepted] = useState<string[]>([]);
    return (
      <OfficerActions
        actions={[
          { id: "a", label: "Flag for enhanced due diligence" },
          { id: "b", label: "Trigger secondary review" },
        ]}
        enabled={true}
        accepted={accepted}
        onToggle={(id, checked) =>
          setAccepted((p) => (checked ? [...p, id] : p.filter((x) => x !== id)))
        }
      />
    );
  },
};

export const Override: StoryObj = {
  render: () => {
    const [v, setV] = useState<OverrideDecision | null>(null);
    const [j, setJ] = useState("");
    return (
      <HumanOverrideBar value={v} onChange={setV} justification={j} onJustificationChange={setJ} />
    );
  },
};

export const Sources: StoryObj = {
  render: () => (
    <EvidenceSourcesPanel
      sources={{
        queried: 4,
        responded: 3,
        corroborated: 2,
        detail: [
          { name: "OFAC", grade: "VERIFIED", responded: true },
          { name: "MarineTraffic", grade: "OBSERVED", responded: true },
          { name: "OpenCorporates", grade: "CORROBORATED", responded: true },
          { name: "INTERPOL", grade: "UNKNOWN", responded: false },
        ],
      }}
    />
  ),
};

export const Questions: StoryObj = {
  render: () => (
    <NextQuestions questions={["Show ownership chain", "Any sanctions exposure on directors?"]} />
  ),
};
