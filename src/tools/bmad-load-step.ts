/**
 * bmad_load_step — Load the next step in the active workflow.
 * Resolves the next step file path from the current step's frontmatter.
 * State is read/written via Convex.
 */

import { Type } from "@sinclair/typebox";
import { readState, updateProgress } from "../lib/convex-state.ts";
import { loadStepFile, listStepFiles, resolveStepPath } from "../lib/step-loader.ts";
import { getWorkflow } from "../lib/workflow-registry.ts";
import { join, dirname } from "node:path";
import type { ToolResult } from "../types.ts";

export const name = "bmad_load_step";
export const description =
  "Load the next step in the active BMad workflow. Call this after completing the current step.";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
  step: Type.Optional(
    Type.Number({
      description:
        "Specific step number to load (optional — defaults to next step)",
    })
  ),
});

export async function execute(
  _id: string,
  params: { projectPath: string; step?: number },
  context: { bmadMethodPath: string }
): Promise<ToolResult> {
  const { projectPath } = params;

  const state = await readState(projectPath);
  if (!state) {
    return text("Error: Project not initialized.");
  }
  if (!state.activeWorkflow) {
    return text("Error: No active workflow. Start one with `bmad_start_workflow`.");
  }

  const active = state.activeWorkflow;

  // Variable resolution map
  const vars: Record<string, string> = {
    "project-root": projectPath,
    date: new Date().toISOString().split("T")[0],
    project_name: state.projectName,
    user_name: "User",
    communication_language: "english",
    document_output_language: "english",
    user_skill_level: "expert",
    output_folder: "_bmad-output",
    planning_artifacts: join(projectPath, "_bmad-output/planning-artifacts"),
    implementation_artifacts: join(projectPath, "_bmad-output/implementation-artifacts"),
    product_knowledge: join(projectPath, "docs"),
  };

  // If a specific step number was requested, find it by number
  if (params.step != null) {
    const workflowDef = getWorkflow(active.id);
    if (!workflowDef?.stepsDir) {
      return text(
        `Error: Cannot jump to step ${params.step} — workflow "${active.id}" does not use numbered step files.`
      );
    }
    const stepsDir = join(context.bmadMethodPath, workflowDef.stepsDir);
    const allSteps = await listStepFiles(stepsDir);
    const targetFile = allSteps.find((f) => {
      const match = f.match(/^step-(?:[a-z]+-)?(\d+)/);
      return match && parseInt(match[1], 10) === params.step;
    });
    if (!targetFile) {
      return text(
        `Error: Step ${params.step} not found in workflow "${active.id}". ` +
          `Available steps: ${allSteps.map((f) => f.match(/^step-(?:[a-z]+-)?(\d+)/)?.[1]).filter(Boolean).join(", ")}`
      );
    }
    const targetPath = join(stepsDir, targetFile);
    const stepData = await loadStepFile(targetPath);

    let resolvedContent = stepData.content;
    for (const [key, value] of Object.entries(vars)) {
      resolvedContent = resolvedContent.replaceAll(`{{${key}}}`, value);
      resolvedContent = resolvedContent.replaceAll(`{${key}}`, value);
    }

    // Sync to Convex
    if (active.workflowRunId) {
      await updateProgress({
        workflowId: active.workflowRunId,
        currentStep: stepData.stepNumber,
        totalSteps: active.totalSteps,
        metadata: {
          currentStepFile: targetPath,
          outputFile: stepData.outputFile ? resolveStepPath(stepData.outputFile, vars) : undefined,
        },
      });
    }

    const stepLabel = active.totalSteps
      ? `${stepData.stepNumber} of ${active.totalSteps}`
      : `${stepData.stepNumber}`;

    return text(
      [
        `## Step ${stepLabel}: ${stepData.name || stepData.description}`,
        "",
        resolvedContent,
        "",
        "---",
        "",
        stepData.nextStepFile
          ? `**When complete:** Call \`bmad_save_artifact\` to save this step's output, then \`bmad_load_step\` for the next step.`
          : `**This is the final step.** Call \`bmad_save_artifact\` to save output, then \`bmad_complete_workflow\` to finalize.`,
      ].join("\n")
    );
  }

  // Load current step to find the next step path
  const currentStep = await loadStepFile(active.currentStepFile);

  // Auto-discover next step if frontmatter has no nextStepFile
  let nextStepFileValue = currentStep.nextStepFile;
  if (!nextStepFileValue) {
    const currentDir = dirname(active.currentStepFile);
    const allSteps = await listStepFiles(currentDir);
    const currentBasename = active.currentStepFile.split("/").pop() ?? "";
    const currentIdx = allSteps.indexOf(currentBasename);
    if (currentIdx >= 0 && currentIdx < allSteps.length - 1) {
      nextStepFileValue = "./" + allSteps[currentIdx + 1];
    }
  }

  if (!nextStepFileValue) {
    return text(
      `This is the final step of the "${active.id}" workflow.\n` +
        `Call \`bmad_complete_workflow\` to finalize.`
    );
  }

  // Resolve the next step path
  let nextStepPath = resolveStepPath(nextStepFileValue, vars);

  if (!nextStepPath.startsWith("/")) {
    if (nextStepPath.startsWith("./") || nextStepPath.startsWith("../")) {
      nextStepPath = join(dirname(active.currentStepFile), nextStepPath);
    } else if (nextStepPath.startsWith("bmm/") || nextStepPath.startsWith("core/")) {
      nextStepPath = join(context.bmadMethodPath, nextStepPath);
    } else {
      nextStepPath = join(dirname(active.currentStepFile), nextStepPath);
    }
  }

  let nextStep;
  try {
    nextStep = await loadStepFile(nextStepPath);
  } catch (err) {
    return text(
      `Error loading next step file: ${nextStepPath}\n${err instanceof Error ? err.message : String(err)}`
    );
  }

  let resolvedContent = nextStep.content;
  for (const [key, value] of Object.entries(vars)) {
    resolvedContent = resolvedContent.replaceAll(`{{${key}}}`, value);
    resolvedContent = resolvedContent.replaceAll(`{${key}}`, value);
  }

  // Sync to Convex
  if (active.workflowRunId) {
    await updateProgress({
      workflowId: active.workflowRunId,
      currentStep: nextStep.stepNumber,
      totalSteps: active.totalSteps,
      metadata: {
        currentStepFile: nextStepPath,
        outputFile: nextStep.outputFile ? resolveStepPath(nextStep.outputFile, vars) : undefined,
      },
    });
  }

  const stepLabel = active.totalSteps
    ? `${nextStep.stepNumber} of ${active.totalSteps}`
    : `${nextStep.stepNumber}`;

  const output = [
    `## Step ${stepLabel}: ${nextStep.name || nextStep.description}`,
    "",
    resolvedContent,
    "",
    "---",
    "",
    nextStep.nextStepFile
      ? `**When complete:** Call \`bmad_save_artifact\` to save this step's output, then \`bmad_load_step\` for the next step.`
      : `**This is the final step.** Call \`bmad_save_artifact\` to save output, then \`bmad_complete_workflow\` to finalize.`,
  ];

  return text(output.join("\n"));
}

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}
