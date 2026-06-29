import type { FlatToken, ScoredColor, CKMap, DtcgOutput, DtcgToken } from "../types.js";

const PROPRIETARY_FONT_FLAGS = [
  "neue haas", "helvetica neue", "gotham", "circular", "gt walsheim",
  "canela", "domaine", "tiempos", "graphik", "sohne",
];

/**
 * Build a CollectiveKit-aligned variable map from scored colors + flat tokens.
 */
export function buildCKMap(
  scored: ScoredColor[],
  tokens: FlatToken[],
  dtcg: DtcgOutput,
  warnings: string[]
): CKMap {
  // Colors — use CK slot assignments from scored palette (highest score wins each slot)
  const colors: Record<string, string> = {};
  for (const c of scored) {
    if (c.ckSlot !== "unmapped" && !colors[c.ckSlot]) {
      colors[c.ckSlot] = c.hex;
    }
  }

  // Typography — read directly from dembrandt's structured output
  const { headingFamily, paragraphFamily } = extractFontFamilies(dtcg, warnings);
  const scale = buildTypeScale(dtcg, tokens);

  // Borders
  const borderTokens = tokens.filter(
    (t) =>
      t.type === "dimension" &&
      (t.path.toLowerCase().includes("border") || t.path.toLowerCase().includes("stroke"))
  );
  const borders: Record<string, number> = {};
  if (borderTokens.length > 0) {
    const sorted = [...borderTokens]
      .map((t) => parseFloat(t.value))
      .filter((v) => v > 0 && v <= 10)
      .sort((a, b) => a - b);
    borders["border width/xs (1)"] = sorted[0] ?? 1;
    if (sorted[1]) borders["border width/sm (2)"] = sorted[1];
  } else {
    borders["border width/xs (1)"] = 1;
  }

  return {
    colors,
    typography: { headingFamily, paragraphFamily, scale },
    borders,
  };
}

function extractFontFamilies(
  dtcg: DtcgOutput,
  warnings: string[]
): { headingFamily: string; paragraphFamily: string } {
  // dembrandt puts font families at typography.font-family.*
  const fontGroup = (dtcg as Record<string, unknown>)["typography"] as
    | Record<string, unknown>
    | undefined;
  const familyGroup = fontGroup?.["font-family"] as Record<string, unknown> | undefined;

  const families: string[] = [];
  if (familyGroup) {
    for (const val of Object.values(familyGroup)) {
      const token = val as DtcgToken;
      if (token && typeof token.$value === "string") {
        families.push(token.$value);
      }
    }
  }

  // Fall back to fontFamily tokens from the flat list
  if (families.length === 0) {
    const fontTokens = Object.entries(dtcg)
      .filter(([, v]) => isToken(v) && (v as DtcgToken).$type === "fontFamily")
      .map(([, v]) => String((v as DtcgToken).$value));
    families.push(...fontTokens);
  }

  const headingFamily = families[0] ?? "Inter";
  const paragraphFamily = families[1] ?? families[0] ?? "Inter";

  [headingFamily, paragraphFamily].forEach((f) => flagIfProprietary(f, warnings));
  return { headingFamily, paragraphFamily };
}

function isToken(val: unknown): boolean {
  return val !== null && typeof val === "object" && "$value" in (val as Record<string, unknown>);
}

function flagIfProprietary(font: string, warnings: string[]): void {
  const lower = font.toLowerCase();
  if (PROPRIETARY_FONT_FLAGS.some((f) => lower.includes(f))) {
    warnings.push(
      `Font licensing: "${font}" may require a commercial license — verify before use.`
    );
  }
}

function buildTypeScale(
  dtcg: DtcgOutput,
  _tokens: FlatToken[]
): Record<string, number> {
  const scale: Record<string, number> = {};

  // dembrandt puts typography styles at typography.styles.*
  const typoGroup = (dtcg as Record<string, unknown>)["typography"] as
    | Record<string, unknown>
    | undefined;
  const stylesGroup = typoGroup?.["styles"] as Record<string, unknown> | undefined;

  const sizes: number[] = [];
  if (stylesGroup) {
    for (const val of Object.values(stylesGroup)) {
      const token = val as DtcgToken;
      if (
        token?.$type === "typography" &&
        token.$value &&
        typeof token.$value === "object" &&
        "fontSize" in token.$value
      ) {
        const dim = (token.$value as { fontSize: { value: number } }).fontSize;
        if (dim?.value) sizes.push(dim.value);
      }
    }
  }

  // Deduplicate and sort largest-first
  const unique = [...new Set(sizes)].sort((a, b) => b - a);

  const headingSlots = ["h1", "h2", "h3", "h4", "h5", "h6"];
  headingSlots.forEach((h, i) => {
    const px = unique[i] ?? fallbackSize(i);
    scale[`${h}/text size`] = px;
    scale[`${h}/line height`] = Math.round((px * 1.25) / 4) * 4;
    scale[`${h}/paragraph spacing`] = Math.round((px * 0.5) / 4) * 4;
  });

  // Paragraph: next 3 sizes after headings, or defaults
  const paragraphSources = unique.slice(6, 9);
  [
    ["paragraph lg", 20],
    ["paragraph md", 16],
    ["paragraph sm", 14],
  ].forEach(([key, defaultPx], i) => {
    const px = paragraphSources[i] ?? defaultPx;
    scale[`${key}/text size`] = px as number;
    scale[`${key}/line height`] = Math.round(((px as number) * 1.5) / 4) * 4;
    scale[`${key}/paragraph spacing`] = 16;
  });

  return scale;
}

function fallbackSize(index: number): number {
  return [48, 36, 30, 24, 20, 18][index] ?? 16;
}
