/**
 * bmad_complete_workflow — Mark the active workflow as complete.
 * Updates state, advances phase if appropriate, suggests next workflows.
 */

import { Type } from "@sinclair/typebox";
import { readState, writeState } from "../lib/state.ts";
import { getAvailableWorkflows, getWorkflow } from "../lib/workflow-registry.ts";
import type { BmadPhase, ToolResult } from "../types.ts";
import { syncWorkflowReady } from "../lib/convex-sync.ts";

export const name = "bmad_complete_workflow";
export const description =
  "Mark the active BMad workflow as complete. Updates project state and suggests next workflows.";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
});

/** Phase progression order */


const WORKFLOW_TO_ARTIFACT: Record<string, string> = {
  "create-product-brief": "product-brief",
  "create-prd": "prd",
  "create-architecture": "architecture",
  "create-epics": "epics",
  "sprint-planning": "sprint-planning",
};

const PHASE_ORDER: BmadPhase[] = [
  "analysis",
  "planning",
  "solutioning",
  "implementation",
];

export async function execute(
  _id: string,
  params: { projectPath: string }
): Promise<ToolResult> {
  const state = await readState(params.projectPath);
  if (!state) {
    return text("Error: Project not initialized.");
  }
  if (!state.activeWorkflow) {
    return text("Error: No active workflow to complete.");
  }

  const active = state.activeWorkflow;
  const workflowDef = getWorkflow(active.id);

  // Guard: ensure all steps have been completed before allowing workflow completion
  if (active.totalSteps && active.currentStep < active.totalSteps) {
    return text(
      `Error: Cannot complete workflow "${active.id}" — currently on step ${active.currentStep} of ${active.totalSteps}. ` +
        `Complete all steps before calling \`bmad_complete_workflow\`. ` +
        `Use \`bmad_load_step\` to advance to the next step.`
    );
  }

  // Move to completed
  state.completedWorkflows.push({
    id: active.id,
    agentId: active.agentId,
    outputFile: active.outputFile,
    completedAt: new Date().toISOString(),
  });

  // Clear active
  state.activeWorkflow = null;

  // Advance phase if all workflows in current phase are done
  if (workflowDef) {
    const currentPhaseIdx = PHASE_ORDER.indexOf(state.currentPhase);
    const workflowPhaseIdx = PHASE_ORDER.indexOf(workflowDef.phase);
    if (workflowPhaseIdx > currentPhaseIdx) {
      state.currentPhase = workflowDef.phase;
    }
  }

  await writeState(params.projectPath, state);

  // Option A sync: mark workflow ready_for_review in Convex (best-effort)
  const artifactType = WORKFLOW_TO_ARTIFACT[active.id] || active.id;
  const artifactPath = active.outputFile?.startsWith(params.projectPath)
    ? active.outputFile.slice(params.projectPath.length + 1)
    : active.outputFile;
  await syncWorkflowReady({
    workflowId: active.workflowRunId,
    artifactPath: artifactPath || "",
    artifactType,
  });

  // Suggest next workflows
  const completedIds = state.completedWorkflows.map((w) => w.id);
  const available = getAvailableWorkflows(completedIds).filter(
    (w) => !completedIds.includes(w.id)
  );

  const lines = [
    `✅ Workflow "${active.id}" completed!`,
    "",
    `**Agent:** ${active.agentName} (${active.agentId})`,
    `**Output:** ${active.outputFile || "none"}`,
    `**Duration:** started ${active.startedAt}`,
    "",
  ];

  if (available.length > 0) {
    lines.push("## Recommended Next Steps");
    lines.push("");
    for (const w of available) {
      lines.push(`- **${w.id}** — ${w.description}`);
    }
    lines.push("");
    lines.push(
      "Use `bmad_start_workflow` to begin the next workflow."
    );
  } else {
    lines.push(
      "🎉 All available workflows are complete! The project is ready for the next phase."
    );
  }

  return text(lines.join("\n"));
}

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}
