import { readFile } from "fs/promises";
import path from "path";

/**
 * Loads the Storefront API markdown from the control-plane content folder
 * (with a monorepo fallback for local checkouts).
 */
export async function loadStorefrontApiDocs(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "content", "storefront-api.md"),
    path.join(process.cwd(), "..", "..", "docs", "storefront-api.md"),
  ];

  for (const file of candidates) {
    try {
      return await readFile(file, "utf8");
    } catch {
      /* try next */
    }
  }

  return [
    "# Storefront API",
    "",
    "Documentation file missing. Ensure `content/storefront-api.md` is present.",
  ].join("\n");
}
