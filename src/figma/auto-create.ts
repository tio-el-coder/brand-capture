/**
 * Auto-create a Figma design system file from extracted tokens.
 *
 * Uses the Claude CLI as a subprocess — Claude has Figma MCP access
 * and runs the generated use_figma JavaScript to create the file.
 *
 * Fallback: if Claude CLI not found, saves a prompt to disk the user
 * can paste into Claude manually.
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateFigmaSetupScript } from "./generate-setup-script.js";
import type { CKMap } from "../types.js";

const FIGMA_TEAM_KEY = "team::864268937850463419"; // Arturo Hurtado's Team

export interface FigmaCreateResult {
  fileKey: string;
  fileUrl: string;
  method: "claude-cli" | "manual-prompt";
  promptPath?: string;
}

/**
 * Create a Figma DS file for a brand.
 * Tries Claude CLI first → falls back to saving a prompt file.
 */
export async function autoCreateFigmaDS(
  brandName: string,
  ckMap: CKMap,
  outDir: string
): Promise<FigmaCreateResult> {
  const setupScript = generateFigmaSetupScript(brandName, ckMap);
  const scriptPath = join(outDir, "figma-setup.js");
  writeFileSync(scriptPath, setupScript, "utf8");

  // Check if Claude CLI is available
  const claudeAvailable = checkClaudeCLI();

  if (claudeAvailable) {
    return runViaClaude(brandName, setupScript, outDir);
  } else {
    return savePromptFallback(brandName, setupScript, outDir, scriptPath);
  }
}

function checkClaudeCLI(): boolean {
  try {
    const result = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function runViaClaude(
  brandName: string,
  setupScript: string,
  outDir: string
): Promise<FigmaCreateResult> {
  console.log(`\n  Creating Figma DS file via Claude CLI…`);

  const prompt = buildClaudePrompt(brandName, setupScript);
  const promptPath = join(outDir, "figma-claude-prompt.txt");
  writeFileSync(promptPath, prompt, "utf8");

  try {
    // Run Claude CLI with the prompt — Claude uses Figma MCP to create the file
    const result = spawnSync(
      "claude",
      ["-p", prompt, "--output-format", "json"],
      {
        encoding: "utf8",
        timeout: 120_000, // 2 min max
        maxBuffer: 1024 * 1024,
      }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || "Claude CLI exited with non-zero status");
    }

    // Extract file key from Claude's response
    // Figma file keys are 22-char alphanumeric strings
    const output = result.stdout;
    let fileKey = "unknown";

    // Try JSON parse first (Claude returns {"fileKey":"..."})
    try {
      const jsonMatch = output.match(/\{[^}]*"fileKey"\s*:\s*"([A-Za-z0-9]{10,30})"[^}]*\}/);
      if (jsonMatch) fileKey = jsonMatch[1];
    } catch { /* ignore */ }

    // Fallback: extract from figma.com/design/<key> URL
    if (fileKey === "unknown") {
      const urlMatch = output.match(/figma\.com\/design\/([A-Za-z0-9]{10,30})/);
      if (urlMatch) fileKey = urlMatch[1];
    }

    const fileUrl = fileKey !== "unknown"
      ? `https://www.figma.com/design/${fileKey}`
      : "";

    // Save result
    writeFileSync(join(outDir, "figma-file.json"), JSON.stringify({ fileKey, fileUrl, brandName }, null, 2), "utf8");

    console.log(`  ✓ Figma DS file created: ${fileUrl}`);
    return { fileKey, fileUrl, method: "claude-cli" };
  } catch (err) {
    console.warn(`  ⚠ Claude CLI failed: ${err instanceof Error ? err.message : err}`);
    console.warn(`  Falling back to prompt file…`);
    return savePromptFallback(brandName, setupScript, outDir, join(outDir, "figma-setup.js"));
  }
}

function savePromptFallback(
  brandName: string,
  setupScript: string,
  outDir: string,
  scriptPath: string
): FigmaCreateResult {
  const prompt = buildClaudePrompt(brandName, setupScript);
  const promptPath = join(outDir, "figma-claude-prompt.txt");
  writeFileSync(promptPath, prompt, "utf8");

  console.log(`
  Claude CLI not available (or failed).
  To create the Figma DS file manually:

  Option A — paste the prompt into Claude:
    cat ${promptPath} | pbcopy
    → paste into a Claude conversation with Figma MCP connected

  Option B — run via Claude CLI when available:
    claude -p "$(cat ${promptPath})"

  Option C — run the setup script directly in an existing file:
    → Open Figma, open Console, paste contents of:
    ${scriptPath}
  `);

  return { fileKey: "pending", fileUrl: "", method: "manual-prompt", promptPath };
}

function buildClaudePrompt(brandName: string, setupScript: string): string {
  return `You have access to the Figma MCP. Do exactly the following steps in order:

STEP 1: Create a new Figma design file named "${brandName} — Design System" in team ${FIGMA_TEAM_KEY}.
Use the create_new_file tool. Save the returned file key.

STEP 2: In the new file, run this exact JavaScript via use_figma:

\`\`\`javascript
${setupScript}
\`\`\`

STEP 3: Return ONLY this JSON (no other text):
{"fileKey":"<the file key from step 1>","fileUrl":"https://www.figma.com/design/<fileKey>","variables":"created"}

Do not add any explanation. Do not skip any step. The file key must be from the create_new_file response.`;
}
