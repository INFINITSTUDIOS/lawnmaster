import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, priceFor, stripeInterval, tierForSqft } from "@/lib/pricing";
import type { LawnTier } from "@/lib/types";

const tiers: LawnTier[] = [
  { id: "m", company_id: "c", name: "Medium", min_sqft: 5000, max_sqft: 10000 },
  { id: "s", company_id: "c", name: "Small", min_sqft: 0, max_sqft: 5000 },
  { id: "l", company_id: "c", name: "Large", min_sqft: 10000, max_sqft: 20000 },
];

describe("tierForSqft", () => {
  it("picks by range, lower bound inclusive", () => {
    expect(tierForSqft(tiers, 0)?.id).toBe("s");
    expect(tierForSqft(tiers, 4999)?.id).toBe("s");
    expect(tierForSqft(tiers, 5000)?.id).toBe("m");
    expect(tierForSqft(tiers, 12000)?.id).toBe("l");
  });
  it("uses the largest tier for oversize lawns", () => {
    expect(tierForSqft(tiers, 50000)?.id).toBe("l");
  });
  it("handles an open-ended top tier and no tiers", () => {
    expect(tierForSqft([...tiers, { id: "x", company_id: "c", name: "XL", min_sqft: 20000, max_sqft: null }], 99999)?.id).toBe("x");
    expect(tierForSqft([], 100)).toBeNull();
  });
});

describe("prices and money", () => {
  it("looks up a price", () => {
    const prices = [{ area_id: "a", tier_id: "s", frequency: "weekly" as const, price_cents: 4500 }];
    expect(priceFor(prices, "a", "s", "weekly")).toBe(4500);
    expect(priceFor(prices, "a", "s", "monthly")).toBeNull();
  });
  it("parses and formats money", () => {
    expect(parseMoney("$45")).toBe(4500);
    expect(parseMoney("45.5")).toBe(4550);
    expect(parseMoney("0")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(formatMoney(4500)).toBe("$45");
    expect(formatMoney(4550)).toBe("$45.50");
  });
  it("maps frequencies to Stripe intervals", () => {
    expect(stripeInterval("triweekly")).toEqual({ interval: "week", interval_count: 3 });
    expect(stripeInterval("monthly")).toEqual({ interval: "month", interval_count: 1 });
  });
});
