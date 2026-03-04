/**
 * bmad_run_checks — Run TypeScript check + unit tests + optional E2E tests.
 * Deterministic tool — no AI, just executes commands and returns structured results.
 */

import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "../types.ts";

export const name = "bmad_run_checks";
export const description =
  "Run project checks: TypeScript type-check + unit tests + optional E2E tests. Returns structured pass/fail results.";

export const parameters = Type.Object({
  projectPath: Type.String({
    description: "Absolute path to the project root directory",
  }),
  e2e: Type.Optional(
    Type.Boolean({
      description: "Run E2E tests (Maestro for mobile, Playwright for web). Default: false",
    })
  ),
  testFilter: Type.Optional(
    Type.String({
      description: "Filter pattern for unit tests (passed to vitest --filter)",
    })
  ),
});

interface CheckResult {
  pass: boolean;
  errors: string[];
  summary: string;
}

function runCommand(cmd: string, cwd: string, timeoutMs = 120000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || "",
      stderr: err.stderr?.toString() || "",
      exitCode: err.status ?? 1,
    };
  }
}

function detectE2ERunner(projectPath: string): "maestro" | "playwright" | null {
  // Check for Maestro (mobile/Expo)
  if (existsSync(join(projectPath, ".maestro")) || existsSync(join(projectPath, "maestro"))) {
    return "maestro";
  }
  // Check for Playwright (web)
  if (existsSync(join(projectPath, "playwright.config.ts")) || existsSync(join(projectPath, "playwright.config.js"))) {
    return "playwright";
  }
  // Check in monorepo apps
  if (existsSync(join(projectPath, "apps/native/.maestro"))) return "maestro";
  if (existsSync(join(projectPath, "apps/web/playwright.config.ts"))) return "playwright";
  return null;
}

function parseTypeScriptErrors(output: string): string[] {
  // Extract TS error lines (file.ts(line,col): error TSxxxx: message)
  return output
    .split("\n")
    .filter((line) => /error TS\d+/.test(line))
    .slice(0, 30); // Cap at 30 errors to keep output manageable
}

function parseVitestOutput(output: string): { failures: string[]; summary: string } {
  const lines = output.split("\n");
  const failures = lines
    .filter((line) => /FAIL|✗|×|❌/.test(line) || /AssertionError|Error:/.test(line))
    .slice(0, 20);
  const summaryLine = lines.find((line) => /Tests?\s+\d+/.test(line) || /Test Files/.test(line)) || "";
  return { failures, summary: summaryLine };
}

export async function execute(
  _id: string,
  params: { projectPath: string; e2e?: boolean; testFilter?: string }
): Promise<ToolResult> {
  const { projectPath, e2e = false, testFilter } = params;

  const results: {
    ts: CheckResult;
    unit: CheckResult;
    e2e?: CheckResult;
  } = {
    ts: { pass: false, errors: [], summary: "" },
    unit: { pass: false, errors: [], summary: "" },
  };

  // 1. TypeScript check
  // Find all tsconfig.json files (excluding node_modules, .react-email)
  let tsCmd: string;
  if (existsSync(join(projectPath, "tsconfig.json"))) {
    tsCmd = "npx tsc --noEmit";
  } else {
    // Monorepo: check common locations
    const tsconfigPaths = ["apps/web", "apps/native", "packages/backend/convex", "apps/admin"]
      .filter((p) => existsSync(join(projectPath, p, "tsconfig.json")));
    if (tsconfigPaths.length > 0) {
      tsCmd = tsconfigPaths.map((p) => `npx tsc --noEmit -p ${p}`).join(" && ");
    } else {
      tsCmd = "echo 'No tsconfig.json found'";
    }
  }

  const tsResult = runCommand(tsCmd, projectPath, 60000);
  const tsErrors = parseTypeScriptErrors(tsResult.stdout + tsResult.stderr);
  results.ts = {
    pass: tsResult.exitCode === 0,
    errors: tsErrors,
    summary: tsResult.exitCode === 0
      ? "✅ TypeScript: no errors"
      : `❌ TypeScript: ${tsErrors.length} error(s)`,
  };

  // 2. Unit tests (vitest)
  const hasVitest =
    existsSync(join(projectPath, "vitest.config.ts")) ||
    existsSync(join(projectPath, "vitest.config.js")) ||
    existsSync(join(projectPath, "packages/backend/vitest.config.ts"));

  if (hasVitest) {
    const filterArg = testFilter ? ` --filter "${testFilter}"` : "";
    const vitestCmd = existsSync(join(projectPath, "vitest.config.ts"))
      ? `npx vitest run${filterArg}`
      : `npx vitest run${filterArg} --config packages/backend/vitest.config.ts`;

    const unitResult = runCommand(vitestCmd, projectPath, 120000);
    const { failures, summary } = parseVitestOutput(unitResult.stdout + unitResult.stderr);
    results.unit = {
      pass: unitResult.exitCode === 0,
      errors: failures,
      summary: unitResult.exitCode === 0
        ? `✅ Unit tests: ${summary || "all passed"}`
        : `❌ Unit tests: ${failures.length} failure(s) — ${summary}`,
    };
  } else {
    results.unit = {
      pass: true,
      errors: [],
      summary: "⚠️ Unit tests: no vitest config found (skipped)",
    };
  }

  // 3. E2E tests (optional)
  if (e2e) {
    const runner = detectE2ERunner(projectPath);
    if (runner === "maestro") {
      const maestroDir = existsSync(join(projectPath, ".maestro"))
        ? join(projectPath, ".maestro")
        : join(projectPath, "apps/native/.maestro");
      const e2eResult = runCommand(`maestro test ${maestroDir}`, projectPath, 300000);
      results.e2e = {
        pass: e2eResult.exitCode === 0,
        errors: e2eResult.stdout.split("\n").filter((l) => /FAIL|ERROR/i.test(l)).slice(0, 20),
        summary: e2eResult.exitCode === 0
          ? "✅ E2E (Maestro): all passed"
          : "❌ E2E (Maestro): failures detected",
      };
    } else if (runner === "playwright") {
      const e2eResult = runCommand("npx playwright test", projectPath, 300000);
      results.e2e = {
        pass: e2eResult.exitCode === 0,
        errors: e2eResult.stdout.split("\n").filter((l) => /failed|error/i.test(l)).slice(0, 20),
        summary: e2eResult.exitCode === 0
          ? "✅ E2E (Playwright): all passed"
          : "❌ E2E (Playwright): failures detected",
      };
    } else {
      results.e2e = {
        pass: true,
        errors: [],
        summary: "⚠️ E2E: no test runner found (no .maestro/ or playwright.config.ts)",
      };
    }
  }

  // Build output
  const allPass = results.ts.pass && results.unit.pass && (results.e2e?.pass ?? true);
  const lines = [
    allPass ? "# ✅ All checks passed" : "# ❌ Some checks failed",
    "",
    `## TypeScript`,
    results.ts.summary,
    ...results.ts.errors.map((e) => `  ${e}`),
    "",
    `## Unit Tests`,
    results.unit.summary,
    ...results.unit.errors.map((e) => `  ${e}`),
  ];

  if (results.e2e) {
    lines.push("", `## E2E Tests`, results.e2e.summary);
    lines.push(...results.e2e.errors.map((e) => `  ${e}`));
  }

  lines.push("", "---", `**Result:** ${allPass ? "PASS ✅" : "FAIL ❌"}`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
