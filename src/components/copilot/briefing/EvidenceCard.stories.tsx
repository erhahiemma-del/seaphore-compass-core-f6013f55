import type { Meta, StoryObj } from "@storybook/react";
import { EvidenceCard } from "./EvidenceCard";
import type { EvidenceGrade } from "./types";

const meta: Meta<typeof EvidenceCard> = {
  title: "Copilot/Briefing/EvidenceCard",
  component: EvidenceCard,
};
export default meta;

const GRADES: EvidenceGrade[] = [
  "VERIFIED",
  "CORROBORATED",
  "OBSERVED",
  "REPORTED",
  "INFERRED",
  "UNKNOWN",
];

export const AllGrades: StoryObj = {
  render: () => (
    <div className="grid gap-3 md:grid-cols-2">
      {GRADES.map((g) => (
        <EvidenceCard
          key={g}
          evidence={{
            id: g,
            grade: g,
            title: `${g} sample claim`,
            source: "Mock source",
            observedAt: "2026-07-18",
            summary: "One-line evidence summary to demonstrate layout and grade colour.",
            hash: "d41d8cd98f00b204e9800998ecf8427e",
          }}
        />
      ))}
    </div>
  ),
};
