import { describe, expect, it } from "vitest";
import { applicationFee, mapStripeStatus } from "@/lib/stripe/status";

describe("mapStripeStatus", () => {
  it("maps Stripe states", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("incomplete")).toBeNull();
  });
});

describe("applicationFee", () => {
  it("is zero when no fee is configured", () => {
    expect(applicationFee(10000, 0)).toBe(0);
  });
  it("rounds to cents", () => {
    expect(applicationFee(4599, 3)).toBe(138);
  });
});
