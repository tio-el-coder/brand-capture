import type { DtcgOutput, FlatToken, ScoredColor, ColorRole } from "../types.js";

const MAX_PALETTE = 12;

// Elements that signal visual prominence (large surfaces)
const PROMINENT_SELECTORS = ["body", "header", "nav", "footer", "section", "main", "hero"];

/**
 * Flatten a DTCG token tree into a list of FlatTokens.
 */
export function flattenDtcg(dtcg: DtcgOutput, prefix = ""): FlatToken[] {
  const tokens: FlatToken[] = [];
  for (const [key, val] of Object.entries(dtcg)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && "$value" in val) {
      tokens.push({
        path,
        value: String((val as { $value: unknown }).$value),
        type: (val as { $type: FlatToken["type"] }).$type,
      });
    } else if (val && typeof val === "object") {
      tokens.push(...flattenDtcg(val as DtcgOutput, path));
    }
  }
  return tokens;
}

/**
 * Infer the role of a hex color from its lightness + saturation.
 * This is a heuristic — not a guarantee.
 */
function inferRole(hex: string, frequency: number, prominence: number): ColorRole {
  const { l, s } = hexToHsl(hex);

  // Very light → likely a background/surface
  if (l > 90) {
    if (prominence > 0.5) return "surface-default";
    return "surface-secondary";
  }

  // Very dark → likely text or primary surface
  if (l < 15) {
    if (prominence > 0.6) return "surface-primary";
    return "text-heading";
  }

  // Mid-dark → body text
  if (l < 40 && s < 30) return "text-body";

  // Muted mid-tones → captions or borders
  if (l > 40 && l < 70 && s < 20) {
    if (frequency > 5) return "border-default";
    return "text-caption";
  }

  // High saturation + single use → accent
  if (s > 60 && frequency <= 3) return "accent";

  return "unmapped";
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
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

/**
 * Score and rank extracted colors, returning the top MAX_PALETTE with CK slot assignments.
 * Colors beyond the cap go into the `unmapped` list.
 */
export function scorePalette(
  tokens: FlatToken[]
): { scored: ScoredColor[]; unmapped: string[] } {
  const colorTokens = tokens.filter((t) => t.type === "color" && t.value.startsWith("#"));

  // Count frequency per hex (case-insensitive)
  const freq: Record<string, number> = {};
  const prominence: Record<string, number> = {};

  for (const t of colorTokens) {
    const hex = t.value.toLowerCase();
    freq[hex] = (freq[hex] ?? 0) + 1;
    // Boost prominence if the token path contains a prominent selector keyword
    const hasProminence = PROMINENT_SELECTORS.some((s) => t.path.toLowerCase().includes(s));
    prominence[hex] = (prominence[hex] ?? 0) + (hasProminence ? 1 : 0);
  }

  const uniqueHexes = Object.keys(freq);
  const maxFreq = Math.max(...Object.values(freq), 1);
  const maxProm = Math.max(...Object.values(prominence), 1);

  // Score = normalized frequency (70%) + normalized prominence (30%)
  const scored = uniqueHexes
    .map((hex) => ({
      hex,
      frequency: freq[hex],
      prominence: prominence[hex] / maxProm,
      score: (freq[hex] / maxFreq) * 0.7 + (prominence[hex] / maxProm) * 0.3,
    }))
    .sort((a, b) => b.score - a.score);

  const kept = scored.slice(0, MAX_PALETTE);
  const dropped = scored.slice(MAX_PALETTE).map((c) => c.hex);

  // Assign roles, then map roles to CollectiveKit slots
  const roleAssigned: ScoredColor[] = kept.map((c) => {
    const role = inferRole(c.hex, c.frequency, c.prominence);
    return {
      hex: c.hex,
      frequency: c.frequency,
      prominence: c.prominence,
      role,
      ckSlot: roleToCkSlot(role),
    };
  });

  return { scored: roleAssigned, unmapped: dropped };
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
