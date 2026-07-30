/** Shared helpers for storefront connection / clone instructions. */

export function publicApiUrl(): string {
  return (
    process.env.CONTROL_PLANE_PUBLIC_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

export function degitSource(): string {
  return (
    process.env.RULESHOP_DEGIT_SOURCE?.trim() ||
    "mihai888nextlab/ruleshop/apps/storefront"
  );
}

export function storefrontImage(): string {
  return (
    process.env.RULESHOP_STOREFRONT_IMAGE?.trim() ||
    "ghcr.io/mihai888nextlab/ruleshop-storefront:latest"
  );
}

/**
 * RULESHOP_API_URL is read by the *browser* (via /config.js), not by the
 * container process. Always use a URL the shopper's browser can reach —
 * localhost for local control plane, or https://… for a public deploy.
 * Never rewrite to host.docker.internal (browsers cannot resolve it).
 */
export function buildDockerRunCommand(apiKey: string): string {
  const apiUrl = publicApiUrl();
  const image = storefrontImage();
  const run = [
    "docker run --rm -p 3008:80",
    `-e RULESHOP_API_URL=${apiUrl}`,
    `-e RULESHOP_API_KEY=${apiKey}`,
    image,
  ].join(" ");
  return `docker pull ${image} && ${run}`;
}

/** Optional local Vite clone (secondary). */
export function buildDegitCommand(apiKey: string): string {
  const apiUrl = publicApiUrl();
  const source = degitSource();
  return [
    `npx degit ${source} my-store`,
    `cd my-store`,
    `cp .env.example .env`,
    `# then set VITE_RULESHOP_API_URL=${apiUrl}`,
    `# and VITE_RULESHOP_API_KEY=${apiKey}`,
    `npm i && npm run dev`,
  ].join("\n");
}

/** @deprecated Prefer buildDockerRunCommand — kept as alias for existing callers. */
export function buildCloneCommand(apiKey: string): string {
  return buildDockerRunCommand(apiKey);
}
