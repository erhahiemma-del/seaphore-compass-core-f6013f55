export type InvestigationStatus = "open" | "in_review" | "decided" | "shared";

export interface InvestigationSummary {
  id: string;
  mission: string;
  vessel: string;
  imo: string;
  officer: string;
  status: InvestigationStatus;
  risk: "low" | "medium" | "high" | "critical";
  confidencePct: number;
}
