import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // STRIPE_API_BASE points the SDK at a stand-in server (stripe-mock, e2e tests).
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client = base
    ? new Stripe(key, { host: base.hostname, port: Number(base.port) || undefined, protocol: base.protocol === "http:" ? "http" : "https" })
    : new Stripe(key);
  return client;
}
