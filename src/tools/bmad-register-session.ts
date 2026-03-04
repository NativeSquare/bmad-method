/**
 * bmad_register_session — Register the sub-agent session key in Convex.
 * Call this immediately after sessions_spawn to link the sub-agent chat to the workflow.
 */

import { Type } from "@sinclair/typebox";
import { readState, updateProgress } from "../lib/convex-state.ts";
import type { ToolResult } from "../types.ts";

export const name = "bmad_register_session";
export const description =
  "Register a sub-agent session key in the active workflow (Convex). Call immediately after sessions_spawn.";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
  sessionKey: Type.String({
    description: "The session key returned by sessions_spawn",
  }),
});

export async function execute(
  _id: string,
  params: { projectPath: string; sessionKey: string }
): Promise<ToolResult> {
  const state = await readState(params.projectPath);
  if (!state?.activeWorkflow?.workflowRunId) {
    return { content: [{ type: "text", text: "Error: No active workflow found in Convex." }] };
  }

  await updateProgress({
    workflowId: state.activeWorkflow.workflowRunId,
    currentStep: state.activeWorkflow.currentStep,
    metadata: { sessionKey: params.sessionKey },
  });

  return { content: [{ type: "text", text: `✅ Session key registered in Convex: ${params.sessionKey}` }] };
}
