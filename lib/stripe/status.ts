import type { SubscriptionStatus } from "../types";

/** Map a Stripe subscription status onto ours. Returns null for states we ignore. */
export function mapStripeStatus(status: string): SubscriptionStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // "incomplete": first payment not finished yet; stays pending.
      return null;
  }
}

/** Platform application fee for a one-off amount, in cents (0 when no fee is configured). */
export function applicationFee(amountCents: number, feePercent: number): number {
  if (!(feePercent > 0)) return 0;
  return Math.round((amountCents * feePercent) / 100);
}
