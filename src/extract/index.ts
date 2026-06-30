import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, readdirSync, renameSync } from "node:fs";
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
 *
 * dembrandt saves output to output/<domain>/<timestamp>.tokens.json — we
 * find the latest file and move it to opts.outDir/design-system.dtcg.json.
 */
export async function extract(url: string, opts: ExtractOptions): Promise<DtcgOutput> {
  mkdirSync(opts.outDir, { recursive: true });

  const dtcgDest = join(opts.outDir, "design-system.dtcg.json");
  const designMdDest = join(opts.outDir, "design-system.md");

  const domain = new URL(url).hostname;

  // dembrandt saves to output/<hostname>/ relative to CWD
  // Check both with and without www. since dembrandt may use either
  const hostname = new URL(url).hostname;
  const hostnameStripped = hostname.replace(/^www\./, "");
  const dembrandtOutWww = join(process.cwd(), "output", hostname);
  const dembrandtOutStripped = join(process.cwd(), "output", hostnameStripped);
  // Use whichever exists after extraction (prefer www. first since that's what dembrandt uses)
  let dembrandtOut = dembrandtOutWww;

  const flags = [
    "--dtcg",
    "--save-output",
    opts.dark ? "--dark-mode" : "",
    opts.scroll ? "--slow" : "",
    opts.cookies ? `--cookie "${opts.cookies}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const cmd = `npx dembrandt "${url}" ${flags}`;
  try {
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`dembrandt extraction failed for ${url}:\n${msg}`);
  }

  // Find the latest .tokens.json — check both www. and stripped paths
  let tokenFile = findLatestFile(dembrandtOutWww, ".tokens.json");
  if (!tokenFile) tokenFile = findLatestFile(dembrandtOutStripped, ".tokens.json");
  if (tokenFile) dembrandtOut = tokenFile.substring(0, tokenFile.lastIndexOf("/"));
  if (!tokenFile) {
    throw new Error(`dembrandt ran but produced no .tokens.json in ${dembrandtOutWww} or ${dembrandtOutStripped}`);
  }

  // Move to our canonical output path
  if (tokenFile !== dtcgDest) {
    renameSync(tokenFile, dtcgDest);
  }

  const raw = JSON.parse(readFileSync(dtcgDest, "utf8")) as DtcgOutput;

  // Also generate DESIGN.md for AI consumption
  if (!existsSync(designMdDest)) {
    try {
      const mdCmd = `npx dembrandt "${url}" --design-md --save-output ${opts.dark ? "--dark-mode" : ""}`;
      execSync(mdCmd, { stdio: ["ignore", "pipe", "pipe"] });
      const mdFile = findLatestFile(dembrandtOut, ".md");
      if (mdFile && mdFile !== designMdDest) renameSync(mdFile, designMdDest);
    } catch {
      // DESIGN.md is nice-to-have; don't fail if it errors
    }
  }

  return raw;
}

function findLatestFile(dir: string, ext: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => join(dir, f))
    .sort()
    .reverse(); // ISO timestamp sort → latest first
  return files[0] ?? null;
}
