import type { Frequency, LawnTier, MowingPrice } from "./types";

export const SQFT_PER_SQM = 10.7639104;

export function sqmToSqft(sqm: number): number {
  return Math.round(sqm * SQFT_PER_SQM);
}

/** The tier whose [min, max) range contains the lawn size; the largest tier catches anything bigger. */
export function tierForSqft(tiers: LawnTier[], sqft: number): LawnTier | null {
  const sorted = [...tiers].sort((a, b) => a.min_sqft - b.min_sqft);
  let match: LawnTier | null = null;
  for (const t of sorted) {
    if (sqft >= t.min_sqft && (t.max_sqft === null || sqft < t.max_sqft)) return t;
    if (sqft >= t.min_sqft) match = t;
  }
  return match ?? sorted[0] ?? null;
}

export function priceFor(
  prices: MowingPrice[],
  areaId: string,
  tierId: string,
  frequency: Frequency,
): number | null {
  const p = prices.find((x) => x.area_id === areaId && x.tier_id === tierId && x.frequency === frequency);
  return p && p.price_cents > 0 ? p.price_cents : null;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "12.50" / "$12" -> 1250. Returns null for anything that isn't a positive amount. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}

/** Stripe recurring interval for each mowing frequency. */
export function stripeInterval(frequency: Frequency): { interval: "week" | "month"; interval_count: number } {
  switch (frequency) {
    case "weekly":
      return { interval: "week", interval_count: 1 };
    case "biweekly":
      return { interval: "week", interval_count: 2 };
    case "triweekly":
      return { interval: "week", interval_count: 3 };
    case "monthly":
      return { interval: "month", interval_count: 1 };
  }
}

/** Approximate monthly revenue of one subscription, in cents. */
export function monthlyValue(frequency: Frequency, priceCents: number): number {
  const perMonth = { weekly: 52 / 12, biweekly: 26 / 12, triweekly: 52 / 3 / 12, monthly: 1 }[frequency];
  return Math.round(priceCents * perMonth);
}
