// W3C DTCG token structure (simplified for our use)
export interface DtcgToken {
  $value: string | number;
  $type: "color" | "dimension" | "fontFamily" | "fontWeight" | "number" | "string";
  $description?: string;
}

export interface DtcgGroup {
  [key: string]: DtcgToken | DtcgGroup;
}

export type DtcgOutput = DtcgGroup;

// Flat extracted token (after flattening DTCG tree)
export interface FlatToken {
  path: string;       // e.g. "color.primary.500"
  value: string;
  type: DtcgToken["$type"];
}

// A scored color with role assignment
export interface ScoredColor {
  hex: string;
  frequency: number;    // how many times it appears in computed CSS
  prominence: number;   // 0-1 weight for large vs. small element usage
  role: ColorRole;
  ckSlot: string;       // CollectiveKit variable name
}

export type ColorRole =
  | "surface-default"
  | "surface-primary"
  | "surface-secondary"
  | "text-heading"
  | "text-body"
  | "text-caption"
  | "border-default"
  | "accent"
  | "unmapped";

// CollectiveKit variable map (what gets written to Figma + variables.css)
export interface CKMap {
  colors: Record<string, string>;       // ck variable name → hex
  typography: {
    headingFamily: string;
    paragraphFamily: string;
    scale: Record<string, number>;      // e.g. "h3/text size" → 48
  };
  borders: Record<string, number>;      // e.g. "border width/xs (1)" → 1
}

// Final output bundle
export interface CaptureResult {
  url: string;
  brand: string;
  domain: string;
  dtcg: DtcgOutput;
  ckMap: CKMap;
  unmapped: string[];   // color hex values that didn't fit the 12-slot cap
  warnings: string[];   // font licensing, canvas content, etc.
}
