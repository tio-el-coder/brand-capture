#!/usr/bin/env node
/**
 * screenshot-analyze — Path B CLI
 *
 * Usage:
 *   screenshot-analyze <image-path> [--brand <name>] [--out <dir>]
 *   screenshot-analyze --prompt <brand>     # Just print the Claude vision prompt
 *
 * The image is analyzed by Claude's vision. You provide the JSON output
 * from Claude, and this CLI writes the design system files.
 *
 * Two modes:
 *   1. Interactive: pass --json <path-to-claude-output.json>
 *   2. Prompt mode: --prompt <brand> → prints the prompt to paste into Claude
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateVisionPrompt, writeScreenshotOutputs } from "./analyze.js";
import type { ScreenshotAnalysis } from "./analyze.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
screenshot-analyze — Path B: Extract a design system from any screenshot

Usage:
  screenshot-analyze --prompt <brand>
      Print the Claude vision prompt to paste alongside your screenshot.
      Copy the prompt + screenshot into Claude, get JSON back.

  screenshot-analyze <image.png> --brand <name> --json <claude-output.json>
      Write design system files from Claude's JSON analysis output.

  screenshot-analyze --prompt <brand> | pbcopy
      Copy the prompt directly to clipboard.

Examples:
  # Step 1: get the prompt
  screenshot-analyze --prompt curology

  # Step 2: paste prompt + screenshot into Claude, save output to analysis.json
  # Step 3: write outputs
  screenshot-analyze screenshot.png --brand curology --json analysis.json
`);
  process.exit(0);
}

// Prompt mode: just print the vision prompt
if (args.includes("--prompt")) {
  const brandIdx = args.indexOf("--prompt");
  const brandName = args[brandIdx + 1] ?? "brand";
  console.log(generateVisionPrompt(brandName));
  process.exit(0);
}

// Analysis mode: read the JSON Claude returned and write outputs
const imagePath = args.find(a => !a.startsWith("--") && a !== args[args.indexOf("--brand") + 1] && a !== args[args.indexOf("--json") + 1] && a !== args[args.indexOf("--out") + 1]);
const brandIdx = args.indexOf("--brand");
const jsonIdx = args.indexOf("--json");
const outIdx = args.indexOf("--out");

const brandName = brandIdx !== -1 ? args[brandIdx + 1] : (imagePath ? imagePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "brand" : "brand");
const jsonPath = jsonIdx !== -1 ? args[jsonIdx + 1] : null;
const outDir = outIdx !== -1 ? args[outIdx + 1] : `output/${brandName}`;

if (!jsonPath) {
  console.log(`
screenshot-analyze — Two-step workflow:

Step 1 — Get the Claude vision prompt:
  screenshot-analyze --prompt ${brandName}

Step 2 — Paste the prompt + your screenshot into Claude.
         Save Claude's JSON response to a file (e.g. analysis.json).

Step 3 — Write outputs:
  screenshot-analyze screenshot.png --brand ${brandName} --json analysis.json
`);
  process.exit(0);
}

if (!existsSync(jsonPath)) {
  console.error(`Error: JSON file not found at ${jsonPath}`);
  process.exit(1);
}

try {
  const analysis = JSON.parse(readFileSync(jsonPath, "utf8")) as ScreenshotAnalysis;
  console.log(`\nscreenshot-analyze → ${imagePath ?? "screenshot"}`);
  console.log(`brand: ${brandName} | confidence: ${analysis.confidence}\n`);
  writeScreenshotOutputs(analysis, brandName, outDir);
} catch (err) {
  console.error("Error parsing JSON:", err instanceof Error ? err.message : err);
  process.exit(1);
}
