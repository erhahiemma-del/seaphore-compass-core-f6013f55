export const mockOfficers = [
  { id: "u-admin", name: "Ada Admin", role: "admin" as const },
  { id: "u-director", name: "Dami Director", role: "director" as const },
  { id: "u-officer", name: "Ola Officer", role: "officer" as const },
  { id: "u-analyst", name: "Ade Analyst", role: "analyst" as const },
] as const;

export type MockOfficer = (typeof mockOfficers)[number];
