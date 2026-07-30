/**
 * Runtime config for Docker / static hosts.
 *
 * Vite bakes `VITE_*` at build time. The published image injects
 * `window.__RULESHOP_CONFIG__` via `/config.js` at container start so one
 * image works for every store without rebuilding.
 */

export type RuleShopRuntimeConfig = {
  apiUrl: string;
  apiKey: string;
};

declare global {
  interface Window {
    __RULESHOP_CONFIG__?: Partial<RuleShopRuntimeConfig>;
  }
}

export function getRuntimeConfig(): RuleShopRuntimeConfig {
  const runtime =
    typeof window !== "undefined" ? window.__RULESHOP_CONFIG__ : undefined;

  const apiUrl = (
    runtime?.apiUrl ||
    (import.meta.env.VITE_RULESHOP_API_URL as string | undefined) ||
    ""
  ).trim();

  const apiKey = (
    runtime?.apiKey ||
    (import.meta.env.VITE_RULESHOP_API_KEY as string | undefined) ||
    ""
  ).trim();

  if (!apiUrl) {
    throw new Error(
      "RULESHOP_API_URL / VITE_RULESHOP_API_URL lipsește. Configurează magazinul.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "RULESHOP_API_KEY / VITE_RULESHOP_API_KEY lipsește. Configurează magazinul.",
    );
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    apiKey,
  };
}
