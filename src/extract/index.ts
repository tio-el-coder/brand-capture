import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DtcgOutput } from "../types.js";

export interface ExtractOptions {
  dark?: boolean;
  scroll?: boolean;
  cookies?: string;
  outDir: string;
}

/**
 * Run dembrandt against a URL and return the parsed DTCG JSON.
 * dembrandt is invoked as a subprocess so its Playwright setup stays isolated.
 */
export async function extract(url: string, opts: ExtractOptions): Promise<DtcgOutput> {
  mkdirSync(opts.outDir, { recursive: true });

  const dtcgPath = join(opts.outDir, "design-system.dtcg.json");
  const designMdPath = join(opts.outDir, "design-system.md");

  const flags = [
    `--dtcg`,
    `--output "${dtcgPath}"`,
    opts.dark ? "--dark" : "",
    opts.scroll ? "--scroll" : "",
    opts.cookies ? `--cookies "${opts.cookies}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // dembrandt CLI: npx dembrandt <url> [flags]
  const cmd = `npx dembrandt "${url}" ${flags}`;
  try {
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`dembrandt extraction failed for ${url}:\n${msg}`);
  }

  if (!existsSync(dtcgPath)) {
    throw new Error(`dembrandt ran but produced no DTCG output at ${dtcgPath}`);
  }

  const raw = JSON.parse(readFileSync(dtcgPath, "utf8")) as DtcgOutput;

  // Also generate a DESIGN.md for AI consumption
  const mdCmd = `npx dembrandt "${url}" --design-md --output "${designMdPath}" ${opts.dark ? "--dark" : ""}`;
  try {
    execSync(mdCmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    // DESIGN.md is nice-to-have; don't fail if it errors
  }

  return raw;
}
