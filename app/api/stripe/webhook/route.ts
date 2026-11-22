import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { fulfillCheckout, syncAccount, syncSubscription } from "@/lib/stripe/fulfill";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe Connect webhook. Subscribe the endpoint ("Events on connected accounts")
 * to: checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted, account.updated.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const db = createAdminClient();
  const { data: seen } = await db.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return Response.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        if (event.account) await fulfillCheckout(event.data.object.id, event.account);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "account.updated":
        await syncAccount(event.data.object);
        break;
    }
  } catch (err) {
    console.error("Stripe webhook failed", event.type, event.id, err);
    // Non-2xx makes Stripe retry; handlers are idempotent.
    return new Response("Handler error", { status: 500 });
  }

  await db.from("stripe_events").upsert({ id: event.id }, { onConflict: "id", ignoreDuplicates: true });
  return Response.json({ received: true });
}
