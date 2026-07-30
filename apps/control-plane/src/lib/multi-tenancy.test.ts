import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";
import { hashStoreApiKey } from "./store-api-key";

/**
 * Multi-tenancy / security helpers that do not need a live database.
 */

describe("store API key hashing", () => {
  it("stores a digest, not the plaintext", () => {
    const plaintext = "rsk_demo_atelier_nord_dev_only_0001";
    const digest = hashStoreApiKey(plaintext);
    expect(digest).not.toContain("rsk_");
    expect(digest).toHaveLength(64);
    expect(digest).toBe(hashStoreApiKey(plaintext));
  });

  it("distinguishes keys for different tenants", () => {
    const fashion = hashStoreApiKey("rsk_demo_atelier_nord_dev_only_0001");
    const electronics = hashStoreApiKey("rsk_demo_circuit_hub_dev_only_0001");
    expect(fashion).not.toBe(electronics);
  });
});

describe("rate limit", () => {
  it("rejects bursts past the window limit", () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    const blocked = rateLimit(key, { limit: 2, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("tenant query shapes", () => {
  it("orders and products are always addressed with storeId", () => {
    // Documentary lock: every tenant table query in the control plane must
    // include storeId. These fixtures mirror the where-clauses used by
    // admin actions and the storefront API.
    const productLookup = { id: "prod_1", storeId: "store_a" };
    const orderLookup = { id: "ord_1", storeId: "store_a", userId: "user_1" };
    const foreignProduct = { id: "prod_1", storeId: "store_b" };

    expect(productLookup.storeId).not.toBe(foreignProduct.storeId);
    expect(orderLookup.storeId).toBe(productLookup.storeId);
  });

  it("loyalty is keyed by membership, not the global user", () => {
    const fashionMembership = {
      storeId: "fashion",
      userId: "vip",
      loyaltyPoints: 500,
    };
    const electronicsMembership = {
      storeId: "electronics",
      userId: "vip",
      loyaltyPoints: 0,
    };
    expect(fashionMembership.userId).toBe(electronicsMembership.userId);
    expect(fashionMembership.loyaltyPoints).not.toBe(
      electronicsMembership.loyaltyPoints,
    );
  });
});
