import type {
  DtcgOutput,
  DtcgToken,
  DtcgColorValue,
  DtcgDimensionValue,
  FlatToken,
  ScoredColor,
  ColorRole,
} from "../types.js";

const MAX_PALETTE = 12;

/**
 * Flatten a dembrandt DTCG token tree into a list of FlatTokens.
 * Handles dembrandt's object $value format for colors and dimensions.
 */
export function flattenDtcg(dtcg: DtcgOutput, prefix = ""): FlatToken[] {
  const tokens: FlatToken[] = [];

  for (const [key, val] of Object.entries(dtcg)) {
    if (key.startsWith("$")) continue; // skip $extensions, $type, etc.
    const path = prefix ? `${prefix}.${key}` : key;

    if (isToken(val)) {
      const token = val as DtcgToken;
      const resolved = resolveTokenValue(token);
      if (resolved !== null) {
        const count = extractCount(token.$description);
        tokens.push({ path, value: resolved.value, type: resolved.type, count });
      }
    } else if (val && typeof val === "object") {
      tokens.push(...flattenDtcg(val as DtcgOutput, path));
    }
  }

  return tokens;
}

function isToken(val: unknown): boolean {
  return (
    val !== null &&
    typeof val === "object" &&
    "$value" in (val as Record<string, unknown>)
  );
}

interface Resolved {
  value: string;
  type: FlatToken["type"];
}

function resolveTokenValue(token: DtcgToken): Resolved | null {
  const v = token.$value;

  // dembrandt color: $value = { hex, colorSpace, components }
  if (token.$type === "color" && v && typeof v === "object" && "hex" in v) {
    return { value: (v as DtcgColorValue).hex, type: "color" };
  }

  // dembrandt dimension: $value = { value, unit }
  if (token.$type === "dimension" && v && typeof v === "object" && "value" in v) {
    const dim = v as DtcgDimensionValue;
    return { value: `${dim.value}${dim.unit}`, type: "dimension" };
  }

  // dembrandt typography: $value = { fontFamily, fontSize, fontWeight, ... }
  if (token.$type === "typography" && v && typeof v === "object" && "fontSize" in v) {
    // Flatten into the font size as the primary value; we handle family separately
    const typo = v as { fontSize: DtcgDimensionValue; fontFamily: string };
    return { value: `${typo.fontSize.value}${typo.fontSize.unit}`, type: "dimension" };
  }

  // Plain string (e.g. fontFamily)
  if (typeof v === "string") return { value: v, type: token.$type as FlatToken["type"] };

  // Plain number
  if (typeof v === "number") return { value: String(v), type: token.$type as FlatToken["type"] };

  return null;
}

// dembrandt puts "Count: 742, Confidence: high" in $description
function extractCount(desc?: string): number | undefined {
  if (!desc) return undefined;
  const m = desc.match(/Count:\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : undefined;
}

/**
 * Score and rank extracted colors using dembrandt's palette counts where available,
 * falling back to frequency from the full token list.
 * Returns top MAX_PALETTE scored colors with CollectiveKit slot assignments.
 */
export function scorePalette(
  tokens: FlatToken[]
): { scored: ScoredColor[]; unmapped: string[] } {
  const colorTokens = tokens.filter((t) => t.type === "color" && t.value.startsWith("#"));

  if (colorTokens.length === 0) {
    return { scored: [], unmapped: [] };
  }

  // Deduplicate by hex, summing counts
  const byHex: Record<string, { count: number; hasPaletteCount: boolean }> = {};
  for (const t of colorTokens) {
    const hex = t.value.toLowerCase();
    const existing = byHex[hex] ?? { count: 0, hasPaletteCount: false };
    byHex[hex] = {
      count: existing.count + (t.count ?? 1),
      hasPaletteCount: existing.hasPaletteCount || t.count != null,
    };
  }

  const uniqueHexes = Object.entries(byHex);
  const maxCount = Math.max(...uniqueHexes.map(([, v]) => v.count), 1);

  const sorted = uniqueHexes
    .map(([hex, data]) => ({ hex, score: data.count / maxCount, count: data.count }))
    .sort((a, b) => b.score - a.score);

  const kept = sorted.slice(0, MAX_PALETTE);
  const dropped = sorted.slice(MAX_PALETTE).map((c) => c.hex);

  const roleAssigned: ScoredColor[] = kept.map((c, i) => {
    const role = inferRole(c.hex, c.score, i);
    return {
      hex: c.hex,
      frequency: c.count,
      prominence: c.score,
      role,
      ckSlot: roleToCkSlot(role),
    };
  });

  return { scored: roleAssigned, unmapped: dropped };
}

/**
 * Infer a semantic role from a color's hex + relative score + rank position.
 * The rank (index in the sorted palette) is a strong signal from dembrandt's count.
 */
function inferRole(hex: string, score: number, rank: number): ColorRole {
  const { l, s } = hexToHsl(hex);

  // Most frequent very dark → dark surface or primary text
  if (l < 10) {
    return rank === 0 ? "surface-primary" : "text-heading";
  }

  // Most frequent very light → default surface (background)
  if (l > 92) {
    return "surface-default";
  }

  // High saturation + not dominant → accent
  if (s > 55 && score < 0.4) {
    return rank <= 3 ? "accent" : "unmapped";
  }

  // Mid-dark low saturation → text
  if (l < 45 && s < 30) {
    return rank <= 2 ? "text-heading" : "text-body";
  }

  // Light-mid low saturation → caption / border
  if (l > 55 && s < 25) {
    return score > 0.3 ? "surface-secondary" : l > 75 ? "border-default" : "text-caption";
  }

  // Mid saturation moderately dark → secondary surface or brand color
  if (s > 20 && l < 70) {
    return "surface-secondary";
  }

  return "unmapped";
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = ((max + min) / 2) * 100;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 50 ? (d / (2 - max - min)) * 100 : (d / (max + min)) * 100;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s), l: Math.round(l) };
}

function roleToCkSlot(role: ColorRole): string {
  const map: Record<ColorRole, string> = {
    "surface-default": "surface/default",
    "surface-primary": "surface/primary/default",
    "surface-secondary": "surface/secondary/default",
    "text-heading": "text/default/heading",
    "text-body": "text/default/body",
    "text-caption": "text/default/caption",
    "border-default": "border/default",
    accent: "accent/default",
    unmapped: "unmapped",
  };
  return map[role];
}
