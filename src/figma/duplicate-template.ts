// Figma REST API — duplicate CollectiveKit template and populate with brand values
// Requires FIGMA_TOKEN env var with write scope on the user's account.

const FIGMA_API = "https://api.figma.com/v1";
const CK_TEMPLATE_KEY = "Rd1UtjK5HJrlfkhPXUykRd";

interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
}

interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
  variableIds: string[];
}

interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

async function figmaFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${FIGMA_API}${path}`, {
    ...init,
    headers: {
      "X-Figma-Token": token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Duplicate the CollectiveKit template file into the user's Figma account.
 * Returns the new file key.
 */
export async function duplicateTemplate(
  brandName: string,
  figmaToken: string
): Promise<string> {
  const body = await figmaFetch(
    `/files/${CK_TEMPLATE_KEY}/duplicate`,
    figmaToken,
    {
      method: "POST",
      body: JSON.stringify({ name: `${brandName} Design System` }),
    }
  );
  const newKey: string = (body as { key: string }).key;
  console.log(`  ✓ Duplicated CollectiveKit template → new file key: ${newKey}`);
  return newKey;
}

/**
 * Write CollectiveKit-mapped variable values into the duplicated Figma file.
 * Only updates COLOR and STRING variables that match CK slot names.
 */
export async function writeVariables(
  fileKey: string,
  ckColors: Record<string, string>,
  typography: { headingFamily: string; paragraphFamily: string },
  figmaToken: string,
  log: string[]
): Promise<void> {
  // Fetch current variables in the duplicate
  const data = (await figmaFetch(
    `/files/${fileKey}/variables/local`,
    figmaToken
  )) as FigmaVariablesResponse;

  const variables = data.meta.variables;
  const collections = data.meta.variableCollections;

  // Build updates array
  const variableUpdates: {
    id: string;
    action: "UPDATE";
    valuesByMode: Record<string, unknown>;
  }[] = [];

  for (const [varId, varDef] of Object.entries(variables)) {
    const name = varDef.name; // e.g. "surface/default"

    // Match color slot
    if (varDef.resolvedType === "COLOR" && ckColors[name]) {
      const hex = ckColors[name];
      const rgba = hexToRgba(hex);
      const collection = Object.values(collections).find((c) =>
        c.variableIds.includes(varId)
      );
      if (!collection) continue;
      const modeId = collection.modes[0]?.modeId;
      if (!modeId) continue;

      variableUpdates.push({
        id: varId,
        action: "UPDATE",
        valuesByMode: { [modeId]: rgba },
      });
      log.push(`COLOR  ${name} → ${hex}`);
    }

    // Match font family slots
    if (varDef.resolvedType === "STRING") {
      let newValue: string | null = null;
      if (name === "font style/heading") newValue = typography.headingFamily;
      if (name === "font style/paragraph") newValue = typography.paragraphFamily;
      if (!newValue) continue;

      const collection = Object.values(collections).find((c) =>
        c.variableIds.includes(varId)
      );
      if (!collection) continue;
      const modeId = collection.modes[0]?.modeId;
      if (!modeId) continue;

      variableUpdates.push({
        id: varId,
        action: "UPDATE",
        valuesByMode: { [modeId]: newValue },
      });
      log.push(`FONT   ${name} → ${newValue}`);
    }
  }

  if (variableUpdates.length === 0) {
    log.push("No matching variable slots found — file may need manual variable setup.");
    return;
  }

  // Check variable count against Figma limits (Free: 1 published library)
  if (variableUpdates.length > 1000) {
    throw new Error(
      `Variable count (${variableUpdates.length}) exceeds safe limits. ` +
        "Upgrade to Figma Professional for larger variable libraries."
    );
  }

  await figmaFetch(`/files/${fileKey}/variables`, figmaToken, {
    method: "POST",
    body: JSON.stringify({ variableUpdates }),
  });

  console.log(`  ✓ Wrote ${variableUpdates.length} variable values to Figma`);
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
    a: 1,
  };
}
