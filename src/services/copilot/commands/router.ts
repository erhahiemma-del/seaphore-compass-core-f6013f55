/**
 * CopilotCommandRouter — Sprint UX-002.
 *
 * The ONLY execution path for Copilot Commands. It resolves the
 * command's `promptTemplate` against the current
 * {@link CommandExecutionContext} and dispatches the resulting text to
 * the same submission function that the officer's textarea uses.
 *
 * There is deliberately no orchestration here: mission construction,
 * OIE, ICE, IAL, Knowledge Graph, Adaptive Briefing and Playbooks are
 * all reused verbatim through the existing pipeline. Because the
 * dispatcher yields a plain prompt string, typing "Generate briefing"
 * and clicking `Generate Briefing` are indistinguishable downstream —
 * one intelligence pipeline, two ways of talking to it.
 */
import {
  evaluateAvailability,
  resolvePromptTemplate,
  type CommandExecutionContext,
  type CopilotCommand,
} from "./registry";

export interface CommandRouteResult {
  ok: boolean;
  prompt?: string;
  message?: string;
  followUps?: string[];
}

/**
 * Execute a command. `submit` is the officer's canonical
 * "send a message to the Copilot" function — usually `handleSubmit`
 * from `src/routes/copilot.tsx`. We never bypass it.
 */
export function routeCommand(
  cmd: CopilotCommand,
  ctx: CommandExecutionContext,
  submit: (prompt: string) => void,
): CommandRouteResult {
  const availability = evaluateAvailability(cmd, ctx);
  if (!availability.available) {
    return { ok: false, message: availability.reason };
  }
  const prompt = resolvePromptTemplate(cmd.promptTemplate, ctx);
  submit(prompt);
  return { ok: true, prompt, followUps: cmd.followUpGenerator(ctx) };
}
