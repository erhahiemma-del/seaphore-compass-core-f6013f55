import { z } from "zod";

export const IdParamSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_\-:.]+$/, "invalid id"),
});
export type IdParam = z.infer<typeof IdParamSchema>;

export const CopilotQueryBodySchema = z.object({
  query: z.string().min(3).max(2000),
  investigationId: z.string().min(1).max(128).optional(),
  context: z
    .object({
      entityIds: z.array(z.string()).max(50).optional(),
      sessionId: z.string().optional(),
    })
    .optional(),
});
export type CopilotQueryBody = z.infer<typeof CopilotQueryBodySchema>;
