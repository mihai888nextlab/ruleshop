/**
 * Resolves catalogue image URLs to local placeholders or the control plane.
 */
import { controlPlaneOrigin } from "./api";

const SLUG_FALLBACKS: Record<string, string> = {
  "palton-lana": "/products/coat.png",
  "rochie-satin": "/products/dress.png",
  "sneakers-albi": "/products/sneakers.png",
  "esofa-matase": "/products/scarf.png",
  "laptop-pro-14": "/products/laptop.png",
  "casti-noise": "/products/headphones.png",
  "monitor-27": "/products/monitor.png",
  "ssd-2tb": "/products/ssd.png",
  "router-wifi7": "/products/router.png",
};

const PNG_PRODUCTS = new Set([
  "coat",
  "dress",
  "sneakers",
  "scarf",
  "laptop",
  "headphones",
  "monitor",
  "ssd",
  "router",
]);

export function productImageSrc(
  imageUrl: string | null | undefined,
  slug?: string,
): string {
  if (imageUrl) {
    if (imageUrl.startsWith("/uploads/")) {
      const origin = controlPlaneOrigin();
      return origin ? `${origin}${imageUrl}` : imageUrl;
    }
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }
    if (imageUrl.endsWith(".svg")) {
      const png = imageUrl.replace(/\.svg$/i, ".png");
      const base = png.split("/").pop()?.replace(/\.png$/i, "") ?? "";
      if (PNG_PRODUCTS.has(base)) return png;
    }
    return imageUrl;
  }

  if (slug && SLUG_FALLBACKS[slug]) return SLUG_FALLBACKS[slug];
  return "/products/placeholder.svg";
}
