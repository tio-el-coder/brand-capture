/**
 * Path B — Screenshot Design System Extractor
 *
 * Takes any image (screenshot, photo, PDF export, Figma export) and extracts
 * a CollectiveKit-compatible design system using Claude's vision.
 *
 * Usage:
 *   screenshot-analyze <image-path-or-url> [--brand <name>] [--out <dir>]
 *
 * The image is read by Claude visually. Outputs the same files as brand-capture (Path A):
 *   - collectivekit-map.json
 *   - variables.css
 *   - design-system.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { CKMap, CaptureResult } from "../types.js";
import { generateVariablesCss } from "../transform/dtcg-to-molino.js";

export interface ScreenshotAnalysis {
  sourceFile: string;
  confidence: "high" | "medium" | "low";
  colors: {
    detected: { hex: string; role: string; confidence: string }[];
    notes: string[];
  };
  typography: {
    headingFamily: string;
    bodyFamily: string;
    displaySize: number;
    bodySize: number;
    notes: string[];
  };
  spacing: { baseUnit: number; notes: string[] };
  components: string[];
  warnings: string[];
}

/**
 * Build a CKMap from a screenshot analysis result.
 * Used when brand-capture has already done the vision analysis
 * and returned structured data.
 */
export function analysisToMap(analysis: ScreenshotAnalysis): CKMap {
  const colorSlotMap: Record<string, string> = {
    "background": "surface/default",
    "surface-default": "surface/default",
    "surface-dark": "surface/primary/default",
    "surface-secondary": "surface/secondary/default",
    "text-heading": "text/default/heading",
    "text-body": "text/default/body",
    "text-caption": "text/default/caption",
    "text-muted": "text/default/caption",
    "accent": "accent/default",
    "cta": "accent/default",
    "border": "border/default",
  };

  const colors: Record<string, string> = {};
  for (const c of analysis.colors.detected) {
    const slot = colorSlotMap[c.role.toLowerCase().replace(/\s+/g, "-")];
    if (slot && !colors[slot] && c.hex.startsWith("#")) {
      colors[slot] = c.hex;
    }
  }

  const scale: Record<string, number> = {};
  const headings = ["h1","h2","h3","h4","h5","h6"];
  const fallbackSizes = [analysis.typography.displaySize, 36, 30, 24, 20, 18];
  headings.forEach((h, i) => {
    const px = fallbackSizes[i] ?? 16;
    scale[`${h}/text size`] = px;
    scale[`${h}/line height`] = Math.round((px * 1.25) / 4) * 4;
    scale[`${h}/paragraph spacing`] = Math.round((px * 0.5) / 4) * 4;
  });
  scale["paragraph lg/text size"] = analysis.typography.bodySize + 4;
  scale["paragraph lg/line height"] = Math.round(((analysis.typography.bodySize + 4) * 1.5) / 4) * 4;
  scale["paragraph md/text size"] = analysis.typography.bodySize;
  scale["paragraph md/line height"] = Math.round((analysis.typography.bodySize * 1.5) / 4) * 4;
  scale["paragraph sm/text size"] = analysis.typography.bodySize - 2;
  scale["paragraph sm/line height"] = Math.round(((analysis.typography.bodySize - 2) * 1.5) / 4) * 4;

  return {
    colors,
    typography: {
      headingFamily: analysis.typography.headingFamily,
      paragraphFamily: analysis.typography.bodyFamily,
      scale,
    },
    borders: { "border width/xs (1)": 1 },
  };
}

/**
 * Generate the Claude vision prompt used to analyze a screenshot.
 * This prompt is what you paste (along with the image) into Claude
 * when doing a manual Path B extraction.
 */
export function generateVisionPrompt(brandName: string): string {
  return `You are a design system analyst. Analyze this screenshot and extract the design system.

Return a JSON object matching this exact schema (no extra text, just the JSON):

{
  "sourceFile": "screenshot",
  "confidence": "high|medium|low",
  "colors": {
    "detected": [
      { "hex": "#xxxxxx", "role": "background|text-heading|text-body|text-muted|accent|cta|border|surface-dark|surface-secondary", "confidence": "high|medium|low" }
    ],
    "notes": ["any observations about color usage"]
  },
  "typography": {
    "headingFamily": "font name or best guess",
    "bodyFamily": "font name or best guess",
    "displaySize": 48,
    "bodySize": 16,
    "notes": ["observations about type usage, weights, spacing"]
  },
  "spacing": {
    "baseUnit": 8,
    "notes": ["observations about spacing rhythm"]
  },
  "components": ["list of visible UI components: Button, Card, Nav, Hero, etc."],
  "warnings": ["anything uncertain, proprietary fonts, low contrast issues"]
}

Rules:
- Extract up to 8 colors. Rank by visual importance (background first, then text, then accent).
- For role: "background" = page bg, "text-heading" = headline color, "text-body" = paragraph, "text-muted" = captions/labels, "accent" or "cta" = buttons/links, "surface-dark" = dark panels/nav, "border" = dividers/outlines
- For font families: name what you see if recognizable (Inter, DM Sans, Helvetica, etc.); if custom/unknown say "custom-[description]" e.g. "custom-serif-display"
- displaySize: estimate the hero headline font size in px
- bodySize: estimate the body paragraph font size in px (usually 14-18)
- baseUnit: the apparent spacing base (usually 4 or 8)
- confidence: "high" if clearly visible, "medium" if inferred, "low" if guessing
- Brand name for context: ${brandName}`;
}

/**
 * Write screenshot analysis outputs to disk.
 * Called after Claude has analyzed the screenshot and returned structured JSON.
 */
export function writeScreenshotOutputs(
  analysis: ScreenshotAnalysis,
  brandName: string,
  outDir: string
): void {
  mkdirSync(outDir, { recursive: true });

  const ckMap = analysisToMap(analysis);

  // Write collectivekit-map.json
  writeFileSync(
    join(outDir, "collectivekit-map.json"),
    JSON.stringify(ckMap, null, 2),
    "utf8"
  );

  // Write variables.css
  const result: CaptureResult = {
    url: `screenshot:${analysis.sourceFile}`,
    brand: brandName,
    domain: brandName,
    dtcg: {},
    ckMap,
    unmapped: [],
    warnings: analysis.warnings,
  };
  writeFileSync(join(outDir, "variables.css"), generateVariablesCss(result), "utf8");

  // Write DESIGN.md
  const designMd = `# ${brandName} — Design System (from screenshot)
*Source: ${analysis.sourceFile} | Confidence: ${analysis.confidence}*

## Colors
${analysis.colors.detected.map(c => `- **${c.role}**: \`${c.hex}\` (${c.confidence})`).join("\n")}

${analysis.colors.notes.map(n => `> ${n}`).join("\n")}

## Typography
- Heading font: ${analysis.typography.headingFamily}
- Body font: ${analysis.typography.bodyFamily}
- Display size: ~${analysis.typography.displaySize}px
- Body size: ~${analysis.typography.bodySize}px

${analysis.typography.notes.map(n => `> ${n}`).join("\n")}

## Components Visible
${analysis.components.map(c => `- ${c}`).join("\n")}

## Warnings
${analysis.warnings.map(w => `⚠️ ${w}`).join("\n")}
`;
  writeFileSync(join(outDir, "design-system.md"), designMd, "utf8");

  console.log(`\n── Screenshot analysis outputs ─────────────────────────`);
  console.log(`  ${outDir}/`);
  console.log(`    collectivekit-map.json`);
  console.log(`    variables.css`);
  console.log(`    design-system.md`);
  console.log(`\n── Next steps ──────────────────────────────────────────`);
  console.log(`  1. Copy variables.css → brands/${brandName}/tokens/variables.css`);
  console.log(`  2. Run: /design analyze --brand ${brandName}`);
  console.log(`  3. Run: /design variants ${brandName}\n`);
}
