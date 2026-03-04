/**
 * bmad_get_state — Read the current BMad project state from Convex.
 */

import { Type } from "@sinclair/typebox";
import { readState } from "../lib/convex-state.ts";
import type { ToolResult } from "../types.ts";

export const name = "bmad_get_state";
export const description =
  "Get the current BMad project state from Convex (phase, active workflow, completed workflows).";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
});

export async function execute(
  _id: string,
  params: { projectPath: string }
): Promise<ToolResult> {
  const state = await readState(params.projectPath);
  if (!state) {
    return text("Error: Project not initialized or not found in Convex. Run `bmad_init_project` first.");
  }

  const lines = [
    `# BMad Project State: ${state.projectName}`,
    "",
    `**Path:** \`${state.projectPath}\``,
    `**Phase:** ${state.currentPhase}`,
    `**Created:** ${state.createdAt}`,
    "",
  ];

  if (state.activeWorkflow) {
    const aw = state.activeWorkflow;
    lines.push("## Active Workflow");
    lines.push(`- **ID:** ${aw.id}`);
    lines.push(`- **Agent:** ${aw.agentName} (${aw.agentId})`);
    lines.push(`- **Mode:** ${aw.mode}`);
    lines.push(`- **Step:** ${aw.currentStep}${aw.totalSteps ? ` of ${aw.totalSteps}` : ""}`);
    lines.push(`- **Output:** ${aw.outputFile || "not set"}`);
    lines.push(`- **Started:** ${aw.startedAt}`);
    lines.push("");
  } else {
    lines.push("## Active Workflow");
    lines.push("None — ready to start a new workflow.");
    lines.push("");
  }

  if (state.completedWorkflows.length > 0) {
    lines.push("## Completed Workflows");
    for (const cw of state.completedWorkflows) {
      lines.push(`- **${cw.id}** — agent: ${cw.agentId}, output: \`${cw.outputFile || "n/a"}\`, completed: ${cw.completedAt}`);
    }
  } else {
    lines.push("## Completed Workflows");
    lines.push("None yet.");
  }

  return text(lines.join("\n"));
}

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}
