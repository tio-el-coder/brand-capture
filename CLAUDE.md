# CLAUDE.md — brand-capture

## What This Is

A CLI that extracts a design system from any live URL and outputs:
- A CollectiveKit-mapped variable set (for Figma)
- A molino-ready `variables.css` (for `brand.sh` HTML generation)
- A DTCG JSON token file (W3C standard)
- An AI-readable `DESIGN.md` brief

Part of the agentic design loop:
```
URL → brand-capture → variables.css + Figma clone
                    → /design analyze (CRO + DS audit)
                    → /design variants (testable HTML + Figma frames)
                    → /design codify → /design systematize (winner → DS)
```

## Architecture

```
src/
  cli.ts                      ← entry point; arg parsing + orchestration
  types.ts                    ← shared interfaces (DtcgOutput, CKMap, etc.)
  extract/index.ts            ← dembrandt subprocess wrapper
  transform/
    palette-score.ts          ← frequency+prominence scoring → 12-color palette
    collectivekit-mapper.ts   ← extracted tokens → CollectiveKit naming convention
    dtcg-to-molino.ts         ← CKMap → variables.css for molino brands
  figma/
    duplicate-template.ts     ← clone CollectiveKit template via Figma REST API
                                 Template file key: Rd1UtjK5HJrlfkhPXUykRd
output/[domain]/              ← all outputs per run (gitignored)
  design-system.dtcg.json
  design-system.md
  variables.css
  collectivekit-map.json
  figma-sync.log              ← only if --figma flag used
```

## CollectiveKit Naming Convention

The mapper outputs variables using these slot names (matching the CK template):

**Colors:** `surface/default`, `surface/primary/default`, `surface/secondary/default`,
`text/default/heading`, `text/default/body`, `text/default/caption`,
`border/default`, `accent/default`

**Typography:** `font style/heading`, `font style/paragraph`,
`h{n}/text size`, `h{n}/line height`, `paragraph {lg|md|sm}/text size`

**Borders:** `border width/xs (1)`, `border width/sm (2)`

## Environment Variables

- `FIGMA_TOKEN` — required only for `--figma` flag. Must have write scope.

## Commands

```bash
npm run build                                 # compile TypeScript
npm run capture -- <url> [options]            # run via ts dist

# Or after npm link / npm install -g:
brand-capture <url> --brand <name>
brand-capture <url> --brand <name> --figma    # also create Figma file
brand-capture <url> --brand <name> --dark     # include dark mode
brand-capture <url> --cookies cookies.json    # auth-gated pages
```

## Key Rules

1. **Cap at 12 colors.** `palette-score.ts` never outputs more than 12 mapped slots.
   Anything beyond is logged in `warnings[]` and shown to the user.
2. **Flag font licensing.** Known proprietary families trigger a warning in the output.
   Never assume a font can be redistributed.
3. **`variables.css` is the editable truth.** After `brand-capture`, the CSS file is
   what you edit. The Figma clone is a reference — do not manually edit Figma and
   expect it to sync back.
4. **Never write to Petal.** Outputs go to brand-specific paths. Petal's Figma file
   (`eFOxjrOStPrKoYrnlJqDKL`) is never touched here.
5. **Dembrandt runs as a subprocess.** Never import dembrandt directly — its Playwright
   setup needs to stay isolated.
