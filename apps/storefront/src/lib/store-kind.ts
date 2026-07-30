/** Soft storefront flavour derived from slug / theme — copy and media only. */
export type StoreKind = "fashion" | "electronics" | "default";

export function storeKind(slug: string, themeId?: string): StoreKind {
  if (slug === "fashion" || themeId === "nord") return "fashion";
  if (slug === "electronics" || themeId === "circuit") return "electronics";
  return "default";
}

export function storeHeroCopy(kind: StoreKind): {
  eyebrow: string;
  blurb: string;
  heroImage: string | null;
} {
  switch (kind) {
    case "fashion":
      return {
        eyebrow: "Colecție nouă",
        blurb:
          "Piese esențiale, tăiate curat. Prețurile pe care le vezi sunt evaluate pentru tine, acum.",
        heroImage: "/products/hero.png",
      };
    case "electronics":
      return {
        eyebrow: "Hardware selectat",
        blurb:
          "Laptopuri, audio și periferice alese pentru lucru serios. Prețurile și stocul sunt evaluate în timp real.",
        heroImage: "/products/hero-electronics.png",
      };
    default:
      return {
        eyebrow: "Catalog",
        blurb:
          "Produse selectate, prețuri și disponibilitate evaluate în timp real pentru tine.",
        heroImage: null,
      };
  }
}
