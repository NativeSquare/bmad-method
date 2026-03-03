/**
 * Optional Convex workflow sync helpers (Option A migration path)
 *
 * Resolution order:
 * 1) process.env MISSION_CONTROL_CONVEX_SITE_URL + MISSION_CONTROL_API_KEY
 * 2) /home/office/projects/mission-control/apps/web/.env.local (CONVEX_SITE_URL + API_KEY)
 */

import { readFile } from "node:fs/promises";

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
    // best effort only
  }
}

export async function hasConvexSyncConfig(): Promise<boolean> {
  await loadConfig();
  return !!cachedSite && !!cachedKey;
}

async function post(path: string, body: Record<string, unknown>): Promise<any | null> {
  await loadConfig();
  if (!cachedSite || !cachedKey) return null;

  try {
    const res = await fetch(`${cachedSite}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cachedKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncWorkflowProgress(params: {
  workflowId?: string;
  currentStep?: number;
  totalSteps?: number | null;
}) {
  if (!params.workflowId) return null;
  return await post("/api/workflows/progress", {
    workflowId: params.workflowId,
    currentStep: params.currentStep,
    totalSteps: params.totalSteps ?? undefined,
  });
}

export async function syncWorkflowReady(params: {
  workflowId?: string;
  artifactPath: string;
  artifactType: string;
}) {
  if (!params.workflowId) return null;
  return await post("/api/workflows/ready-for-review", {
    workflowId: params.workflowId,
    artifactPath: params.artifactPath,
    artifactType: params.artifactType,
  });
}

export async function syncWorkflowFailed(params: {
  workflowId?: string;
  error: string;
}) {
  if (!params.workflowId) return null;
  return await post("/api/workflows/fail", {
    workflowId: params.workflowId,
    error: params.error,
  });
}
