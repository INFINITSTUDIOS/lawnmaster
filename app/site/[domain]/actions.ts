"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCustomer, getUser } from "@/lib/auth";
import { polygonCenter, polygonSchema, polygonSqft } from "@/lib/geo";
import { priceFor, tierForSqft } from "@/lib/pricing";
import { back } from "@/lib/redirects";
import { addDays, availableDates, BOOKING_LEAD_DAYS, BOOKING_WINDOW_DAYS, isValidDate, today } from "@/lib/schedule";
import { stripe, stripeConfigured } from "@/lib/stripe/client";
import { createAddonCheckout, createSubscriptionCheckout } from "@/lib/stripe/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin, requireTenant } from "@/lib/tenant";
import { FREQUENCIES, type Addon, type Company, type LawnTier, type MowingPrice, type ServiceArea, type Subscription } from "@/lib/types";
import { loadAvailability, removeUpcomingVisits } from "@/lib/visits";
import type { Polygon } from "geojson";

type AreaContext = { area: ServiceArea; tiers: LawnTier[]; prices: MowingPrice[]; dates: string[] };

/** Everything needed to quote and book an address: its area, prices and open dates. */
async function areaContext(company: Company, lng: number, lat: number): Promise<AreaContext | null> {
  const db = createAdminClient();
  const { data: areaId } = await db.rpc("find_service_area", { p_company: company.id, p_lng: lng, p_lat: lat });
  if (!areaId) return null;
  const [{ data: area }, { data: tiers }, { data: prices }] = await Promise.all([
    db.from("service_areas").select("id, company_id, name, boundary, service_weekdays, daily_capacity, active").eq("id", areaId).single(),
    db.from("lawn_size_tiers").select("id, company_id, name, min_sqft, max_sqft").eq("company_id", company.id).order("min_sqft"),
    db.from("mowing_prices").select("area_id, tier_id, frequency, price_cents").eq("area_id", areaId),
  ]);
  if (!area) return null;
  const from = addDays(today(), BOOKING_LEAD_DAYS);
  const to = addDays(today(), BOOKING_WINDOW_DAYS);
  const dates = availableDates(await loadAvailability(db, area as ServiceArea, from, to), from, to);
  return { area: area as ServiceArea, tiers: (tiers ?? []) as LawnTier[], prices: (prices ?? []) as MowingPrice[], dates };
}

export type LookupResult =
  | { ok: true; areaName: string; tiers: Pick<LawnTier, "id" | "name" | "min_sqft" | "max_sqft">[]; prices: Pick<MowingPrice, "tier_id" | "frequency" | "price_cents">[]; dates: string[] }
  | { ok: false; reason: "outside" | "unavailable" };

export async function lookupAddress(lng: number, lat: number): Promise<LookupResult> {
  const company = await requireTenant();
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return { ok: false, reason: "outside" };
  if (!company.stripe_charges_enabled) return { ok: false, reason: "unavailable" };
  const ctx = await areaContext(company, lng, lat);
  if (!ctx) return { ok: false, reason: "outside" };
  // Only offer sizes that have at least one price in this area.
  const tiers = ctx.tiers.filter((t) => ctx.prices.some((p) => p.tier_id === t.id));
  if (tiers.length === 0 || ctx.dates.length === 0) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    areaName: ctx.area.name,
    tiers: tiers.map(({ id, name, min_sqft, max_sqft }) => ({ id, name, min_sqft, max_sqft })),
    prices: ctx.prices.map(({ tier_id, frequency, price_cents }) => ({ tier_id, frequency, price_cents })),
    dates: ctx.dates,
  };
}

const signupSchema = z.object({
  address: z.string().trim().min(5).max(300),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  outline: polygonSchema.nullable(),
  tierId: z.string().uuid().nullable(),
  frequency: z.enum(FREQUENCIES),
  startDate: z.string().refine(isValidDate),
  addonIds: z.array(z.string().uuid()).max(20),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  password: z.string().min(8).max(200).optional(),
});
export type SignupInput = z.input<typeof signupSchema>;
export type SignupResult = { url: string } | { error: string };

/**
 * Final step of the sign-up wizard. Nothing the browser sends is trusted for
 * pricing: the area, lawn size, price and date are all re-derived here.
 */
export async function startSignup(input: SignupInput): Promise<SignupResult> {
  const company = await requireTenant();
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: "Some details are missing or invalid. Please go back and check each step." };
  const data = parsed.data;
  if (!company.stripe_charges_enabled || !company.stripe_account_id || !stripeConfigured()) {
    return { error: `${company.name} isn't accepting online sign-ups yet.` };
  }

  const ctx = await areaContext(company, data.lng, data.lat);
  if (!ctx) return { error: "That address is outside our service area." };

  let tier: LawnTier | null;
  let sqft: number | null = null;
  const outline = data.outline as Polygon | null;
  if (outline) {
    const [cx, cy] = polygonCenter(outline);
    if (Math.abs(cx - data.lng) > 0.01 || Math.abs(cy - data.lat) > 0.01) return { error: "The lawn outline isn't at your address. Please trace it again." };
    sqft = polygonSqft(outline);
    if (sqft < 50) return { error: "The lawn outline is too small. Please trace it again." };
    tier = tierForSqft(ctx.tiers, sqft);
  } else {
    tier = ctx.tiers.find((t) => t.id === data.tierId) ?? null;
  }
  if (!tier) return { error: "Please choose your lawn size." };
  const price = priceFor(ctx.prices, ctx.area.id, tier.id, data.frequency);
  if (price === null) return { error: "That plan isn't offered for your lawn size. Please pick another." };
  if (!ctx.dates.includes(data.startDate)) return { error: "That start date was just taken. Please pick another." };

  const db = createAdminClient();
  let addons: Addon[] = [];
  if (data.addonIds.length) {
    const { data: rows } = await db.from("addon_services").select("*").eq("company_id", company.id).eq("active", true).in("id", data.addonIds);
    addons = (rows ?? []) as Addon[];
  }

  // Account: use the signed-in user, or create one and sign them in.
  let user = await getUser();
  if (!user) {
    if (!data.email || !data.password) return { error: "Enter your email and a password of at least 8 characters." };
    const created = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (created.error || !created.data.user) {
      return { error: /already|registered|exists/i.test(created.error?.message ?? "") ? "An account with this email already exists. Log in first, then sign up for service." : "Could not create your account. Please try again." };
    }
    const supabase = await createClient();
    const signedIn = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (signedIn.error || !signedIn.data.user) return { error: "Your account was created, but we couldn't log you in. Please log in and try again." };
    user = signedIn.data.user;
  }
  if (!user.email) return { error: "Your account has no email address." };

  const { data: customer, error: customerError } = await db
    .from("customers")
    .upsert(
      {
        company_id: company.id,
        user_id: user.id,
        email: user.email,
        full_name: data.fullName,
        phone: data.phone || null,
        address: data.address,
        lng: data.lng,
        lat: data.lat,
        lawn_outline: outline,
        lawn_sqft: sqft,
        tier_id: tier.id,
        area_id: ctx.area.id,
      },
      { onConflict: "company_id,user_id" },
    )
    .select("id, email, stripe_customer_id")
    .single();
  if (customerError || !customer) return { error: "Could not save your details. Please try again." };

  const { data: existing } = await db.from("subscriptions").select("id").eq("customer_id", customer.id).in("status", ["active", "past_due"]).limit(1);
  if (existing?.length) return { error: "You already have a mowing plan. Manage it from your account page." };
  // Clear out earlier attempts that never reached payment.
  await db.from("subscriptions").delete().eq("customer_id", customer.id).eq("status", "pending");
  await db.from("addon_orders").delete().eq("customer_id", customer.id).eq("status", "pending");

  const { data: sub, error: subError } = await db
    .from("subscriptions")
    .insert({ company_id: company.id, customer_id: customer.id, area_id: ctx.area.id, frequency: data.frequency, price_cents: price, start_date: data.startDate })
    .select("id")
    .single();
  if (subError || !sub) return { error: "Could not start your plan. Please try again." };

  try {
    const session = await createSubscriptionCheckout({
      company,
      customer,
      subscriptionId: sub.id,
      frequency: data.frequency,
      priceCents: price,
      addons: addons.map((a) => ({ name: a.name, price_cents: a.price_cents })),
      origin: await requestOrigin(),
    });
    if (!session.url) throw new Error("no checkout url");
    await db.from("subscriptions").update({ stripe_checkout_session_id: session.id }).eq("id", sub.id);
    if (addons.length) {
      await db.from("addon_orders").insert(
        addons.map((a) => ({ company_id: company.id, customer_id: customer.id, addon_id: a.id, name: a.name, price_cents: a.price_cents, stripe_checkout_session_id: session.id })),
      );
    }
    return { url: session.url };
  } catch (err) {
    console.error("checkout creation failed", err);
    await db.from("subscriptions").delete().eq("id", sub.id);
    return { error: "We couldn't open the payment page. Please try again in a moment." };
  }
}

// --------------------------------------------------------- customer account
export async function customerLogIn(formData: FormData) {
  await requireTenant();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) back("/login", "error", "Wrong email or password.");
  redirect("/account");
}

export async function customerLogOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function orderAddon(formData: FormData) {
  const company = await requireTenant();
  const customer = await getCustomer(company.id);
  if (!customer) redirect("/login");
  if (!company.stripe_charges_enabled || !stripeConfigured()) back("/account", "error", "Online ordering isn't available right now.");
  const db = createAdminClient();
  const { data: addon } = await db.from("addon_services").select("*").eq("id", String(formData.get("addon_id") ?? "")).eq("company_id", company.id).eq("active", true).maybeSingle();
  if (!addon) back("/account", "error", "That service is no longer offered.");

  // Abandoned checkouts from before today are dropped.
  await db.from("addon_orders").delete().eq("customer_id", customer.id).eq("status", "pending").lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const { data: order } = await db
    .from("addon_orders")
    .insert({ company_id: company.id, customer_id: customer.id, addon_id: addon.id, name: addon.name, price_cents: addon.price_cents })
    .select("id")
    .single();
  if (!order) back("/account", "error", "Could not start the order.");
  let url: string | null = null;
  try {
    const session = await createAddonCheckout({ company, customer, orderId: order.id, addon, origin: await requestOrigin() });
    await db.from("addon_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
    url = session.url;
  } catch (err) {
    console.error("addon checkout failed", err);
    await db.from("addon_orders").delete().eq("id", order.id);
  }
  if (!url) back("/account", "error", "We couldn't open the payment page. Please try again.");
  redirect(url);
}

/** Send the customer to Stripe's billing portal to update their card or see invoices. */
export async function openBillingPortal() {
  const company = await requireTenant();
  const customer = await getCustomer(company.id);
  if (!customer) redirect("/login");
  if (!customer.stripe_customer_id || !company.stripe_account_id) back("/account", "error", "No billing details on file yet.");
  let url: string | null = null;
  try {
    const session = await stripe().billingPortal.sessions.create(
      { customer: customer.stripe_customer_id, return_url: `${await requestOrigin()}/account` },
      { stripeAccount: company.stripe_account_id },
    );
    url = session.url;
  } catch (err) {
    console.error("billing portal failed", err);
  }
  if (!url) back("/account", "error", `Billing self-service isn't set up. Please contact ${company.name} to update your card.`);
  redirect(url);
}

export async function cancelPlan() {
  const company = await requireTenant();
  const customer = await getCustomer(company.id);
  if (!customer) redirect("/login");
  const db = createAdminClient();
  const { data } = await db.from("subscriptions").select("*").eq("customer_id", customer.id).in("status", ["active", "past_due"]).maybeSingle();
  const sub = data as Subscription | null;
  if (!sub) back("/account", "error", "You don't have an active plan.");
  if (!sub.stripe_subscription_id || !company.stripe_account_id) back("/account", "error", `Please contact ${company.name} to cancel.`);
  try {
    await stripe().subscriptions.cancel(sub.stripe_subscription_id, {}, { stripeAccount: company.stripe_account_id });
  } catch (err) {
    console.error("cancel failed", err);
    back("/account", "error", `We couldn't cancel online. Please contact ${company.name}.`);
  }
  await db.from("subscriptions").update({ status: "canceled" }).eq("id", sub.id);
  await removeUpcomingVisits(db, sub.id);
  revalidatePath("/account");
  back("/account", "notice", "Your plan is canceled. You won't be charged again.");
}
