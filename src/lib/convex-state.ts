/**
 * Convex-backed state management for BMad Method.
 * Replaces local state.json — Convex is the single source of truth.
 *
 * Resolution order for config:
 * 1) process.env MISSION_CONTROL_CONVEX_SITE_URL + MISSION_CONTROL_API_KEY
 * 2) /home/office/projects/mission-control/apps/web/.env.local (CONVEX_SITE_URL + API_KEY)
 */

import { readFile } from "node:fs/promises";
import type { BmadState, ActiveWorkflow, CompletedWorkflow, BmadPhase } from "../types.ts";

let cachedSite: string | null = null;
let cachedKey: string | null = null;
let loaded = false;

async function loadConfig() {
  if (loaded) return;
  loaded = true;

  cachedSite = process.env.MISSION_CONTROL_CONVEX_SITE_URL || null;
  cachedKey = process.env.MISSION_CONTROL_API_KEY || null;

  if (cachedSite && cachedKey) return;

  try {
    const env = await readFile(
      "/home/office/projects/mission-control/apps/web/.env.local",
      "utf-8"
    );
    for (const line of env.split(/\r?\n/)) {
      if (!cachedSite && line.startsWith("CONVEX_SITE_URL=")) {
        cachedSite = line.split("=").slice(1).join("=").trim();
      }
      if (!cachedKey && line.startsWith("API_KEY=")) {
        cachedKey = line.split("=").slice(1).join("=").trim();
      }
    }
  } catch {
    // best effort
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  await loadConfig();
  if (!cachedSite || !cachedKey) {
    throw new Error("Convex not configured — set MISSION_CONTROL_CONVEX_SITE_URL + MISSION_CONTROL_API_KEY or ensure mission-control .env.local exists");
  }

  const res = await fetch(`${cachedSite}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cachedKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex ${path} failed (${res.status}): ${text}`);
  }

  return await res.json();
}

// ── Read State ──────────────────────────────────────────────────────────────

export async function readState(projectPath: string): Promise<BmadState | null> {
  try {
    const data = await post("/api/state/by-path", { projectPath });

    if (!data.project) return null;

    const project = data.project;
    const activeWf = data.activeWorkflow;
    const completedWfs = data.completedWorkflows || [];

    // Reconstruct BmadState from Convex data
    const state: BmadState = {
      projectName: project.name,
      projectPath: project.projectPath,
      createdAt: new Date(project._creationTime).toISOString(),
      currentPhase: project.phase as BmadPhase,
      activeWorkflow: activeWf ? convexToActiveWorkflow(activeWf) : null,
      completedWorkflows: completedWfs
        .filter((w: any) => w.status !== "running")
        .map((w: any) => convexToCompletedWorkflow(w)),
    };

    return state;
  } catch (e) {
    // If Convex is unreachable, return null (project doesn't exist or network error)
    console.error(`[convex-state] readState error: ${e}`);
    return null;
  }
}

function convexToActiveWorkflow(wf: any): ActiveWorkflow {
  const meta = wf.metadata || {};
  return {
    id: meta.workflowId || wf.workflowType,
    agentId: meta.agentId || "",
    agentName: meta.agentName || "",
    mode: meta.mode || "normal",
    currentStep: wf.currentStep || 1,
    totalSteps: wf.totalSteps || null,
    currentStepFile: meta.currentStepFile || "",
    outputFile: meta.outputFile || wf.artifactPath || "",
    lastSavedStep: meta.lastSavedStep,
    workflowRunId: wf._id,
    startedAt: new Date(wf.startedAt).toISOString(),
  };
}

function convexToCompletedWorkflow(wf: any): CompletedWorkflow {
  const meta = wf.metadata || {};
  return {
    id: wf.workflowType,
    agentId: meta.agentId || "",
    outputFile: wf.artifactPath || meta.outputFile || "",
    completedAt: wf.completedAt ? new Date(wf.completedAt).toISOString() : new Date(wf.startedAt).toISOString(),
  };
}

// ── Create Project ──────────────────────────────────────────────────────────

export async function createProject(params: {
  projectName: string;
  projectPath: string;
  phase?: BmadPhase;
}): Promise<string> {
  const result = await post("/api/projects/create", {
    name: params.projectName,
    projectPath: params.projectPath,
    phase: params.phase || "analysis",
    status: "active",
  });
  return result.id;
}

// ── Update Phase ────────────────────────────────────────────────────────────

export async function updatePhase(projectPath: string, phase: BmadPhase): Promise<void> {
  await post("/api/projects/update-phase", { projectPath, phase });
}

// ── Workflow Operations ─────────────────────────────────────────────────────

export async function startWorkflow(params: {
  projectPath: string;
  workflowType: string;
  totalSteps?: number;
  metadata: {
    workflowId: string; // BMad workflow ID (e.g. "create-product-brief")
    agentId: string;
    agentName: string;
    mode: "normal" | "yolo";
    currentStepFile: string;
    outputFile?: string;
  };
}): Promise<string> {
  const result = await post("/api/workflows/start", {
    projectPath: params.projectPath,
    workflowType: params.workflowType,
    totalSteps: params.totalSteps,
    metadata: params.metadata,
  });
  return result.workflowId;
}

export async function updateProgress(params: {
  workflowId: string;
  currentStep: number;
  totalSteps?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await post("/api/workflows/progress", {
    workflowId: params.workflowId,
    currentStep: params.currentStep,
    totalSteps: params.totalSteps ?? undefined,
    metadata: params.metadata,
  });
}

export async function completeWorkflow(params: {
  workflowId: string;
  artifactPath: string;
  artifactType: string;
}): Promise<void> {
  await post("/api/workflows/ready-for-review", {
    workflowId: params.workflowId,
    artifactPath: params.artifactPath,
    artifactType: params.artifactType,
  });
}

export async function failWorkflow(params: {
  workflowId: string;
  error: string;
}): Promise<void> {
  await post("/api/workflows/fail", {
    workflowId: params.workflowId,
    error: params.error,
  });
}

/**
 * Transition storyRuns for a project from one status to another.
 * Used by bmad_complete_workflow to auto-advance storyRun status.
 */
export async function transitionStoryRuns(
  projectPath: string,
  fromStatus: string,
  toStatus: string,
  storyKey?: string,
): Promise<number> {
  const result = await post("/api/story-runs/list", { projectPath });
  const runs = result?.runs || [];
  let updated = 0;
  for (const run of runs) {
    if (run.status !== fromStatus) continue;
    if (storyKey && !run.storyKey.includes(storyKey)) continue;
    await post("/api/story-runs/progress", { id: run._id, status: toStatus });
    updated++;
    // If no storyKey filter, only transition one at a time
    if (!storyKey) break;
  }
  return updated;
}
