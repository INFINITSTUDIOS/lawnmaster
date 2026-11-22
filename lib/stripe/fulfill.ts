import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "../supabase/admin";
import { generateVisits, removeUpcomingVisits } from "../visits";
import type { Subscription } from "../types";
import { stripe } from "./client";
import { mapStripeStatus } from "./status";

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  !v ? null : typeof v === "string" ? v : v.id;

/**
 * Apply a completed Checkout Session: activate the subscription, mark add-ons
 * paid and schedule visits. Called from both the webhook and the post-checkout
 * page, so it must be idempotent.
 */
export async function fulfillCheckout(sessionId: string, stripeAccount: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("stripe_account_id", stripeAccount).maybeSingle();
  if (!company) return false;

  const session = await stripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount });
  if (session.status !== "complete" || session.payment_status === "unpaid") return false;
  const stripeCustomer = idOf(session.customer);

  if (session.mode === "subscription") {
    const { data: sub } = await db
      .from("subscriptions")
      .select("*")
      .eq("stripe_checkout_session_id", session.id)
      .eq("company_id", company.id)
      .maybeSingle();
    if (!sub) return false;
    let current = sub as Subscription;
    if (current.status === "pending") {
      const { data: updated, error } = await db
        .from("subscriptions")
        .update({ status: "active", stripe_subscription_id: idOf(session.subscription) })
        .eq("id", current.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      current = updated as Subscription;
    }
    if (stripeCustomer) {
      await db.from("customers").update({ stripe_customer_id: stripeCustomer }).eq("id", current.customer_id);
    }
    await generateVisits(db, current);
  } else if (stripeCustomer) {
    const { data: order } = await db
      .from("addon_orders")
      .select("customer_id")
      .eq("stripe_checkout_session_id", session.id)
      .eq("company_id", company.id)
      .limit(1)
      .maybeSingle();
    if (order) {
      await db.from("customers").update({ stripe_customer_id: stripeCustomer }).eq("id", order.customer_id).is("stripe_customer_id", null);
    }
  }

  await db
    .from("addon_orders")
    .update({ status: "paid" })
    .eq("stripe_checkout_session_id", session.id)
    .eq("company_id", company.id)
    .eq("status", "pending");
  return true;
}

/** Mirror a Stripe subscription's status (past due, canceled, recovered). */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const status = mapStripeStatus(subscription.status);
  if (!status) return;
  const db = createAdminClient();
  const { data: sub } = await db.from("subscriptions").select("*").eq("stripe_subscription_id", subscription.id).maybeSingle();
  if (!sub || sub.status === status) return;
  // A canceled subscription never comes back; Stripe creates a new one instead.
  if (sub.status === "canceled") return;
  const { data: updated } = await db.from("subscriptions").update({ status }).eq("id", sub.id).select("*").single();
  if (status === "canceled") await removeUpcomingVisits(db, sub.id);
  if (status === "active" && updated) await generateVisits(db, updated as Subscription);
}

export async function syncAccount(account: Stripe.Account): Promise<void> {
  await createAdminClient()
    .from("companies")
    .update({ stripe_charges_enabled: Boolean(account.charges_enabled) })
    .eq("stripe_account_id", account.id);
}
