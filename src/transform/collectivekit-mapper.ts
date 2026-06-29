import type { FlatToken, ScoredColor, CKMap } from "../types.js";

// Known font-licensing-restricted families — flag but don't block
const PROPRIETARY_FONT_FLAGS = [
  "neue haas", "helvetica neue", "gotham", "circular", "gt walsheim",
  "canela", "domaine", "tiempos", "graphik",
];

/**
 * Build a CollectiveKit-aligned variable map from scored colors + flat tokens.
 * This is what gets written to both Figma and variables.css.
 */
export function buildCKMap(
  scored: ScoredColor[],
  tokens: FlatToken[],
  warnings: string[]
): CKMap {
  const colors: Record<string, string> = {};

  for (const c of scored) {
    if (c.ckSlot !== "unmapped") {
      // Don't overwrite a slot that's already been assigned by a higher-scored color
      if (!colors[c.ckSlot]) {
        colors[c.ckSlot] = c.hex;
      }
    }
  }

  // Typography — extract font families and type scale
  const fontTokens = tokens.filter((t) => t.type === "fontFamily");
  const sizeTokens = tokens.filter((t) => t.type === "dimension" && t.path.includes("size"));

  const headingFamily = extractHeadingFont(fontTokens, warnings);
  const paragraphFamily = extractBodyFont(fontTokens, headingFamily, warnings);

  // Build type scale for h1–h6 + paragraph from extracted sizes
  const scale = buildTypeScale(sizeTokens);

  // Border widths
  const borderTokens = tokens.filter(
    (t) => t.type === "dimension" && t.path.toLowerCase().includes("border")
  );
  const borders: Record<string, number> = {};
  if (borderTokens.length > 0) {
    // Map the smallest border to CK's "border width/xs (1)"
    const sorted = [...borderTokens].sort(
      (a, b) => parseFloat(a.value) - parseFloat(b.value)
    );
    borders["border width/xs (1)"] = parseFloat(sorted[0].value) || 1;
    if (sorted[1]) borders["border width/sm (2)"] = parseFloat(sorted[1].value) || 2;
  } else {
    borders["border width/xs (1)"] = 1;
  }

  return {
    colors,
    typography: { headingFamily, paragraphFamily, scale },
    borders,
  };
}

function extractHeadingFont(fontTokens: FlatToken[], warnings: string[]): string {
  const headingCandidate = fontTokens.find(
    (t) =>
      t.path.toLowerCase().includes("heading") ||
      t.path.toLowerCase().includes("display") ||
      t.path.toLowerCase().includes("title")
  );
  const font = headingCandidate?.value ?? fontTokens[0]?.value ?? "Inter";
  flagIfProprietary(font, warnings);
  return font;
}

function extractBodyFont(
  fontTokens: FlatToken[],
  headingFamily: string,
  warnings: string[]
): string {
  const bodyCandidate = fontTokens.find(
    (t) =>
      t.path.toLowerCase().includes("body") ||
      t.path.toLowerCase().includes("paragraph") ||
      t.path.toLowerCase().includes("text")
  );
  // Fall back to a different font than heading, or heading itself if only one found
  const font =
    bodyCandidate?.value ??
    fontTokens.find((t) => t.value !== headingFamily)?.value ??
    headingFamily;
  flagIfProprietary(font, warnings);
  return font;
}

function flagIfProprietary(font: string, warnings: string[]): void {
  const lower = font.toLowerCase();
  if (PROPRIETARY_FONT_FLAGS.some((f) => lower.includes(f))) {
    warnings.push(
      `Font licensing: "${font}" may require a commercial license — verify before use in your brand.`
    );
  }
}

// Map extracted size tokens to CollectiveKit h1-h6 + paragraph slots
function buildTypeScale(sizeTokens: FlatToken[]): Record<string, number> {
  const scale: Record<string, number> = {};
  const sizes = sizeTokens
    .map((t) => parseFloat(t.value))
    .filter((v) => !isNaN(v) && v > 0)
    .sort((a, b) => b - a); // largest first

  // CollectiveKit heading slots, mapped to the top extracted sizes
  const ckHeadings = [
    "h1/text size",
    "h2/text size",
    "h3/text size",
    "h4/text size",
    "h5/text size",
    "h6/text size",
  ];

  for (let i = 0; i < ckHeadings.length; i++) {
    scale[ckHeadings[i]] = sizes[i] ?? fallbackSize(i);
    // Approximate line height: text size × 1.3, rounded to nearest 4
    scale[ckHeadings[i].replace("text size", "line height")] =
      Math.round(((sizes[i] ?? fallbackSize(i)) * 1.3) / 4) * 4;
  }

  // Paragraph sizes
  const paragraphSizes = [20, 16, 14]; // lg / md / sm defaults
  const extractedSmall = sizes.filter((s) => s <= 24).slice(0, 3);
  ["paragraph lg", "paragraph md", "paragraph sm"].forEach((key, i) => {
    scale[`${key}/text size`] = extractedSmall[i] ?? paragraphSizes[i];
    scale[`${key}/line height`] =
      Math.round(((extractedSmall[i] ?? paragraphSizes[i]) * 1.5) / 4) * 4;
  });

  return scale;
}

function fallbackSize(index: number): number {
  // Sensible defaults if extraction doesn't find enough sizes
  return [48, 36, 30, 24, 20, 16][index] ?? 16;
}
