import "server-only";
import type Stripe from "stripe";
import { stripeInterval } from "../pricing";
import { FREQUENCY_LABEL, type Company, type Customer, type Frequency } from "../types";
import { stripe } from "./client";
import { applicationFee } from "./status";

type Line = { name: string; price_cents: number };

function customerParams(customer: Pick<Customer, "email" | "stripe_customer_id">): Pick<Stripe.Checkout.SessionCreateParams, "customer" | "customer_email"> {
  return customer.stripe_customer_id ? { customer: customer.stripe_customer_id } : { customer_email: customer.email };
}

/**
 * Checkout for a new mowing subscription (plus any add-ons, billed once on the
 * first invoice). Charged directly on the company's connected Stripe account.
 */
export async function createSubscriptionCheckout(args: {
  company: Company;
  customer: Pick<Customer, "email" | "stripe_customer_id">;
  subscriptionId: string;
  frequency: Frequency;
  priceCents: number;
  addons: Line[];
  origin: string;
}): Promise<Stripe.Checkout.Session> {
  const { company } = args;
  if (!company.stripe_account_id) throw new Error("Company has no Stripe account");
  const fee = Number(company.platform_fee_percent);
  return stripe().checkout.sessions.create(
    {
      mode: "subscription",
      ...customerParams(args.customer),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: args.priceCents,
            recurring: stripeInterval(args.frequency),
            product_data: { name: `Lawn mowing — ${FREQUENCY_LABEL[args.frequency].toLowerCase()}` },
          },
        },
        ...args.addons.map((a) => ({
          quantity: 1,
          price_data: { currency: "usd", unit_amount: a.price_cents, product_data: { name: a.name } },
        })),
      ],
      subscription_data: {
        metadata: { subscription_id: args.subscriptionId, company_id: company.id },
        ...(fee > 0 ? { application_fee_percent: fee } : {}),
      },
      metadata: { subscription_id: args.subscriptionId, company_id: company.id },
      success_url: `${args.origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${args.origin}/signup?notice=${encodeURIComponent("Checkout was canceled. Nothing was charged.")}`,
    },
    { stripeAccount: company.stripe_account_id },
  );
}

/** One-off checkout for an add-on service ordered by an existing customer. */
export async function createAddonCheckout(args: {
  company: Company;
  customer: Pick<Customer, "email" | "stripe_customer_id">;
  orderId: string;
  addon: Line;
  origin: string;
}): Promise<Stripe.Checkout.Session> {
  const { company } = args;
  if (!company.stripe_account_id) throw new Error("Company has no Stripe account");
  const fee = applicationFee(args.addon.price_cents, Number(company.platform_fee_percent));
  return stripe().checkout.sessions.create(
    {
      mode: "payment",
      ...customerParams(args.customer),
      ...(args.customer.stripe_customer_id ? {} : { customer_creation: "always" as const }),
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: args.addon.price_cents, product_data: { name: args.addon.name } } }],
      payment_intent_data: {
        metadata: { addon_order_id: args.orderId, company_id: company.id },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      },
      metadata: { addon_order_id: args.orderId, company_id: company.id },
      success_url: `${args.origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${args.origin}/account?notice=${encodeURIComponent("Checkout was canceled. Nothing was charged.")}`,
    },
    { stripeAccount: company.stripe_account_id },
  );
}
