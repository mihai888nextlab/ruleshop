import { describe, expect, it } from "vitest";
import {
  VIP_POINTS_THRESHOLD,
  loyaltyBalance,
  tierForPoints,
} from "./customer-facts";

/**
 * Loyalty is only worth granting if the customer can see it. These lock the
 * shape the storefront reads: a balance, the tier it implies, and the threshold
 * the shop needs to explain the gap.
 */

describe("tier derivation", () => {
  it("promotes exactly at the threshold, not one point later", () => {
    expect(tierForPoints(VIP_POINTS_THRESHOLD - 1)).toBe("standard");
    expect(tierForPoints(VIP_POINTS_THRESHOLD)).toBe("vip");
  });

  it("treats a zero balance as a standing, not a missing value", () => {
    expect(tierForPoints(0)).toBe("standard");
  });
});

describe("loyalty balance surfaced to the storefront", () => {
  it("carries the threshold so the shop need not hard-code it", () => {
    expect(loyaltyBalance(120)).toEqual({
      points: 120,
      tier: "standard",
      vipThreshold: VIP_POINTS_THRESHOLD,
    });
  });

  it("agrees with the tier the rules were evaluated against", () => {
    // The seeded VIP customer: 500 points must read as vip in the profile for
    // the same reason `customer.tier == vip` matches during evaluation.
    const balance = loyaltyBalance(500);
    expect(balance.tier).toBe("vip");
    expect(balance.tier).toBe(tierForPoints(500));
  });
});
