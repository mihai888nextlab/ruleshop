/** Wire types matching control-plane storefront responses (no monorepo imports). */

export type ExplanationStep = {
  ruleKey: string;
  ruleName: string;
  matched: boolean;
  reason: string;
};

export type DecisionMeta = {
  rulesetVersion: number | null;
  matchedRules: string[];
  traceId: string;
  isCanary: boolean;
  explanation?: ExplanationStep[];
  warnings: string[];
};

export type ThemeTokens = {
  colors: {
    bg: string;
    bgDeep: string;
    fg: string;
    muted: string;
    surface: string;
    surface2: string;
    border: string;
    rule: string;
    accent: string;
    accentFg: string;
    positive: string;
    warning: string;
    danger: string;
  };
  fontDisplay: string;
  fontBody: string;
  radius: number;
  displayTracking: number;
  displayWeight: number;
  density: "compact" | "regular" | "airy";
  productRatio: "3 / 4" | "1 / 1" | "4 / 5";
  heroOverlay: number;
  heroImage: string | null;
};

export type ResolvedTheme = {
  key: string | null;
  name: string;
  tokens: ThemeTokens;
  fallback: boolean;
};

export type BootstrapResponse = {
  storeId: string;
  storeName: string;
  slug: string;
  theme: ResolvedTheme;
};

export type PricedProduct = {
  slug: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string | null;
  basePrice: number;
  finalPrice: number;
  discountPercent: number;
  available: boolean;
  availabilityReason: string | null;
  stockLevel: "out" | "low" | "ok";
  pricingDecision: DecisionMeta;
  availabilityDecision: DecisionMeta;
};

export type StoreContext = {
  slug: string;
  name: string;
  theme: {
    themeId: string;
    resolved: ResolvedTheme;
    decision: DecisionMeta;
  };
};

export type CatalogResponse = {
  store: StoreContext;
  products: PricedProduct[];
  categories: string[];
};

export type ProductDetailResponse = {
  store: StoreContext;
  product: PricedProduct;
};

export type ShippingOption = {
  method: string;
  label?: string;
  cost: number;
};

export type CartLine = {
  productSlug: string;
  name: string;
  quantity: number;
  unitBasePrice: number;
  unitPrice: number;
  lineTotal: number;
  discountPercent: number;
  availableStock: number;
  pricingDecision: DecisionMeta;
};

export type LoyaltyPreview = { points: number; decision: DecisionMeta };

export type CartResponse = {
  store: StoreContext;
  lines: CartLine[];
  subtotal: number;
  /** Sum of per-line savings versus catalogue prices. */
  discountTotal: number;
  shippingOptions: ShippingOption[];
  shippingDecision: DecisionMeta;
  /** Points the published rules would grant for this cart. */
  loyalty: LoyaltyPreview;
  fraudDecision: DecisionMeta;
  /** Set when a fraud rule would block checkout, so the UI can warn early. */
  blockedReason: string | null;
  merged: boolean;
  viewer: {
    authenticated: boolean;
    email?: string | null;
    loyaltyPoints: number;
    tier: CustomerTier;
  };
};

export type CheckoutResponse = {
  order: OrderSummary;
  replayed: boolean;
};

export type OrderSummary = {
  id: string;
  status: string;
  createdAt: string;
  subtotal: number;
  discountTotal: number;
  shippingCost: number;
  shippingMethod: string | null;
  total: number;
  loyaltyPointsEarned: number;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
};

export type OrderListResponse = { orders: OrderSummary[] };

export type OrderDetailResponse = {
  order: OrderSummary;
  decisions: {
    pricing: DecisionMeta[];
    shipping: DecisionMeta | null;
    fraud: DecisionMeta | null;
    loyalty: DecisionMeta | null;
  };
};

export type AuthCustomer = {
  id: string;
  email: string;
  name: string | null;
  loyaltyPoints: number;
};

export type AuthResponse = {
  token: string;
  expiresIn: number;
  customer: AuthCustomer;
};

export type ProfileField = {
  key: string;
  label: string;
  description: string | null;
  type: string;
  options: string[];
  required: boolean;
  value: unknown;
};

export type CustomerTier = "guest" | "standard" | "vip";

export type LoyaltyBalance = {
  points: number;
  tier: CustomerTier;
  vipThreshold: number;
};

export type ProfileResponse = { fields: ProfileField[]; loyalty: LoyaltyBalance };

export type ProfileUpdateResponse = {
  ok: boolean;
  fields: ProfileField[];
  errors: Record<string, string>;
};
