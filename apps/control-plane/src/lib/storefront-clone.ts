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
    "mihai/ruleshop/apps/storefront"
  );
}

export function storefrontImage(): string {
  return (
    process.env.RULESHOP_STOREFRONT_IMAGE?.trim() ||
    "ghcr.io/mihai/ruleshop-storefront:latest"
  );
}

export function buildCloneCommand(apiKey: string): string {
  const apiUrl = publicApiUrl();
  const source = degitSource();
  const image = storefrontImage();
  return [
    `# Docker (recommended)`,
    `docker run --rm -p 3000:80 \\`,
    `  -e RULESHOP_API_URL=${apiUrl} \\`,
    `  -e RULESHOP_API_KEY=${apiKey} \\`,
    `  ${image}`,
    ``,
    `# or clone the Vite template`,
    `npx degit ${source} my-store`,
    `cd my-store`,
    `cp .env.example .env`,
    `# then set:`,
    `# VITE_RULESHOP_API_URL=${apiUrl}`,
    `# VITE_RULESHOP_API_KEY=${apiKey}`,
    `npm i && npm run dev`,
  ].join("\n");
}
