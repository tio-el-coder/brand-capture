import type { CKMap, CaptureResult } from "../types.js";

/**
 * Generate a molino-compatible variables.css from a CollectiveKit map.
 * Drop-in replacement for brands/[brand]/tokens/variables.css.
 */
export function generateVariablesCss(result: CaptureResult): string {
  const { ckMap, brand, url } = result;
  const { colors, typography, borders } = ckMap;

  const colorVars = Object.entries(colors)
    .map(([slot, hex]) => `  --${slotToCssVar(slot)}: ${hex};`)
    .join("\n");

  const typeVars = [
    `  --font-style-heading: "${typography.headingFamily}", sans-serif;`,
    `  --font-style-paragraph: "${typography.paragraphFamily}", sans-serif;`,
    ...Object.entries(typography.scale).map(
      ([slot, val]) => `  --${slotToCssVar(slot)}: ${val}px;`
    ),
  ].join("\n");

  const borderVars = Object.entries(borders)
    .map(([slot, val]) => `  --${slotToCssVar(slot)}: ${val}px;`)
    .join("\n");

  // Semantic aliases — bridge raw CK slots to molino's semantic layer
  const semanticAliases = buildSemanticAliases(colors);

  const warnings = result.warnings.length
    ? result.warnings.map((w) => `/* ⚠️  ${w} */`).join("\n") + "\n"
    : "";

  return `${warnings}/* brand-capture — auto-generated from ${url} */
/* brand: ${brand} | generated: ${new Date().toISOString().split("T")[0]} */
/* DO NOT hardcode values — edit tokens here, not in HTML/CSS files */

:root {
  /* === Colors (CollectiveKit semantic slots) === */
${colorVars}

  /* === Semantic aliases (molino bridge) === */
${semanticAliases}

  /* === Typography === */
${typeVars}

  /* === Borders === */
${borderVars}

  /* === Spacing scale (base-8) === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* === Radius scale === */
  --radius-none: 0px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* === Motion === */
  --ease-default: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;

  /* === Layout === */
  --container: 100%;
  --padding: 16px;
}

@media (min-width: 768px) {
  :root {
    --container: 704px;
    --padding: 32px;
  }
}

@media (min-width: 1280px) {
  :root {
    --container: 1184px;
    --padding: 48px;
  }
}
`;
}

/**
 * Convert a CollectiveKit slot name (e.g. "surface/default") to a CSS var name.
 * surface/default → surface-default
 * h3/text size → h3-text-size
 */
function slotToCssVar(slot: string): string {
  return slot
    .replace(/\//g, "-")
    .replace(/\s+/g, "-")
    .replace(/[()]/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function buildSemanticAliases(colors: Record<string, string>): string {
  const lines: string[] = [];

  // Background
  if (colors["surface/default"]) {
    lines.push(`  --color-bg: var(--surface-default, ${colors["surface/default"]});`);
  }
  if (colors["surface/primary/default"]) {
    lines.push(
      `  --color-bg-primary: var(--surface-primary-default, ${colors["surface/primary/default"]});`
    );
  }

  // Text
  if (colors["text/default/heading"]) {
    lines.push(
      `  --color-text: var(--text-default-heading, ${colors["text/default/heading"]});`
    );
  }
  if (colors["text/default/body"]) {
    lines.push(`  --color-body: var(--text-default-body, ${colors["text/default/body"]});`);
  }
  if (colors["text/default/caption"]) {
    lines.push(
      `  --color-muted: var(--text-default-caption, ${colors["text/default/caption"]});`
    );
  }

  // Accent
  if (colors["accent/default"]) {
    lines.push(`  --color-accent: var(--accent-default, ${colors["accent/default"]});`);
  }

  // Border
  if (colors["border/default"]) {
    lines.push(`  --color-border: var(--border-default, ${colors["border/default"]});`);
  }

  return lines.join("\n");
}
