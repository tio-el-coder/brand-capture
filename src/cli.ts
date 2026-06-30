#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { extract } from "./extract/index.js";
import { flattenDtcg, scorePalette } from "./transform/palette-score.js";
import { buildCKMap } from "./transform/collectivekit-mapper.js";
import { generateVariablesCss } from "./transform/dtcg-to-molino.js";
import { autoCreateFigmaDS } from "./figma/auto-create.js";
import type { CaptureResult } from "./types.js";

// ── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  url: string;
  brand: string;
  figma: boolean;
  dark: boolean;
  scroll: boolean;
  cookies?: string;
} {
  const args = argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
brand-capture — Extract a design system from any URL

Usage:
  brand-capture <url> [options]

Options:
  --brand <name>      Brand slug (default: derived from domain)
  --figma             Create a new Figma DS file with all variables.
                      Uses Claude CLI (auto) or saves a prompt to paste manually.
  --dark              Also extract dark-mode tokens
  --scroll            Scroll the full page before extraction (reveals below-fold components)
  --cookies <path>    Path to a cookies.json file for auth-gated pages
  --help              Show this help

Examples:
  brand-capture https://stripe.com --brand stripe
  brand-capture https://stripe.com --brand stripe --figma --dark
  brand-capture https://app.acme.com --cookies cookies.json --scroll
`);
    process.exit(0);
  }

  const url = args.find((a) => a.startsWith("http"));
  if (!url) {
    console.error("Error: URL is required. Usage: brand-capture <url> [options]");
    process.exit(1);
  }

  const brandFlag = args.indexOf("--brand");
  const domain = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  const brand = brandFlag !== -1 ? args[brandFlag + 1] : domain;

  const cookiesFlag = args.indexOf("--cookies");

  return {
    url,
    brand: brand ?? domain,
    figma: args.includes("--figma"),
    dark: args.includes("--dark"),
    scroll: args.includes("--scroll"),
    cookies: cookiesFlag !== -1 ? args[cookiesFlag + 1] : undefined,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const domain = new URL(opts.url).hostname.replace(/^www\./, "");
  const outDir = join(process.cwd(), "output", domain);

  mkdirSync(outDir, { recursive: true });

  console.log(`\nbrand-capture → ${opts.url}`);
  console.log(`brand: ${opts.brand} | output: ${outDir}\n`);

  // Phase 1 — Extract
  console.log("1/4  Extracting design system (dembrandt)…");
  const dtcg = await extract(opts.url, {
    dark: opts.dark,
    scroll: opts.scroll,
    cookies: opts.cookies,
    outDir,
  });

  // Phase 2 — Score palette
  console.log("2/4  Scoring color palette…");
  const tokens = flattenDtcg(dtcg);
  const { scored, unmapped } = scorePalette(tokens);
  const warnings: string[] = [];

  if (unmapped.length > 0) {
    warnings.push(
      `${unmapped.length} colors exceeded the 12-slot cap and were not mapped: ${unmapped.join(", ")}`
    );
  }

  // Phase 3 — Build CollectiveKit map
  console.log("3/4  Mapping to CollectiveKit naming…");
  const ckMap = buildCKMap(scored, tokens, dtcg, warnings);

  const result: CaptureResult = {
    url: opts.url,
    brand: opts.brand,
    domain,
    dtcg,
    ckMap,
    unmapped,
    warnings,
  };

  // Phase 4 — Write outputs
  console.log("4/4  Writing outputs…");

  writeFileSync(
    join(outDir, "collectivekit-map.json"),
    JSON.stringify(ckMap, null, 2),
    "utf8"
  );

  const css = generateVariablesCss(result);
  writeFileSync(join(outDir, "variables.css"), css, "utf8");

  const figmaLog: string[] = [];

  // Always generate the Figma setup script (with or without --figma flag)
  console.log("4b/4  Generating Figma setup script…");
  const figmaResult = await autoCreateFigmaDS(opts.brand, ckMap, outDir);

  // Summary
  console.log("\n── Output ──────────────────────────────────────────────");
  console.log(`  ${outDir}/`);
  console.log(`    design-system.dtcg.json  (raw extraction)`);
  console.log(`    design-system.md         (AI-readable brief)`);
  console.log(`    variables.css            (molino drop-in)`);
  console.log(`    collectivekit-map.json   (CK slot → value)`);
  if (opts.figma) console.log(`    figma-sync.log           (Figma write log)`);

  if (warnings.length > 0) {
    console.log("\n── Warnings ─────────────────────────────────────────────");
    warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
  }

  console.log("\n── Next steps ───────────────────────────────────────────");
  console.log(`  1. In Claude: "Create a Figma DS for ${opts.brand} using ${outDir}/figma-setup.js"`);
  console.log(`     Or: cat ${outDir}/figma-prompt.md | pbcopy → paste into Claude`);
  console.log(`  2. molino init ${opts.brand}  (scaffold brand folder)`);
  console.log(`  3. Copy ${outDir}/variables.css → brands/${opts.brand}/tokens/variables.css\n`);
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
