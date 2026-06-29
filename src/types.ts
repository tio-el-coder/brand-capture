// dembrandt DTCG color value — object with hex + components
export interface DtcgColorValue {
  colorSpace: string;
  components: number[];
  hex: string;
}

// dembrandt DTCG dimension value — object with value + unit
export interface DtcgDimensionValue {
  value: number;
  unit: string;
}

// dembrandt DTCG typography value — composite type
export interface DtcgTypographyValue {
  fontFamily: string;
  fontSize: DtcgDimensionValue;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: DtcgDimensionValue;
}

// W3C DTCG token structure — dembrandt uses object $values for colors/dimensions
export interface DtcgToken {
  $value: string | number | DtcgColorValue | DtcgDimensionValue | DtcgTypographyValue;
  $type: "color" | "dimension" | "fontFamily" | "fontWeight" | "number" | "string" | "typography";
  $description?: string;
}

export interface DtcgGroup {
  [key: string]: DtcgToken | DtcgGroup | unknown;
}

export type DtcgOutput = DtcgGroup;

// Flat extracted token (after flattening DTCG tree)
export interface FlatToken {
  path: string;         // e.g. "color.palette.palette-1"
  value: string;        // always resolved to a string (hex for colors, px for dimensions)
  type: DtcgToken["$type"];
  count?: number;       // dembrandt palette count from $description (colors only)
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
