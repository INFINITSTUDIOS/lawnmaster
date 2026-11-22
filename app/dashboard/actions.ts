"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth";
import { parsePolygon, polygonCenter } from "@/lib/geo";
import { normalizeDomain, platformUrl } from "@/lib/hosts";
import { parseMoney, priceFor, stripeInterval } from "@/lib/pricing";
import { back } from "@/lib/redirects";
import { isValidDate } from "@/lib/schedule";
import { stripe, stripeConfigured } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREQUENCIES, type Frequency, type MowingPrice, type Subscription } from "@/lib/types";
import { addDomain, checkDomain, removeDomain, vercelConfigured } from "@/lib/vercel-domains";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------ service areas
export async function saveArea(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const id = str(formData, "id");
  const here = id ? `/dashboard/areas/${id}` : "/dashboard/areas/new";
  const name = str(formData, "name");
  const boundary = parsePolygon(str(formData, "boundary"));
  const weekdays = [...new Set(formData.getAll("weekday").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const capacityRaw = str(formData, "daily_capacity");
  const capacity = capacityRaw === "" ? null : Number(capacityRaw);

  if (!name) back(here, "error", "Give the area a name.");
  if (!boundary) back(here, "error", "Draw the area on the map first.");
  if (weekdays.length === 0) back(here, "error", "Pick at least one service day.");
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) back(here, "error", "Daily limit must be a whole number, or blank for no limit.");

  const row = { name, boundary, service_weekdays: weekdays, daily_capacity: capacity, active: formData.get("active") !== null || !id };
  let areaId = id;
  if (id) {
    if (!UUID.test(id)) back("/dashboard/areas", "error", "Area not found.");
    const { error } = await supabase.from("service_areas").update(row).eq("id", id).eq("company_id", company.id);
    if (error) back(here, "error", "Could not save the area.");
  } else {
    const { data, error } = await supabase.from("service_areas").insert({ ...row, company_id: company.id }).select("id").single();
    if (error || !data) back(here, "error", "Could not save the area.");
    areaId = data.id;
  }
  if (company.map_center_lng === null && boundary) {
    const [lng, lat] = polygonCenter(boundary);
    await createAdminClient().from("companies").update({ map_center_lng: lng, map_center_lat: lat }).eq("id", company.id);
  }
  revalidatePath("/dashboard", "layout");
  back(`/dashboard/areas/${areaId}`, "notice", id ? "Area saved." : "Area created. Now set its prices below.");
}

export async function deleteArea(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const id = str(formData, "id");
  const { error } = await supabase.from("service_areas").delete().eq("id", id).eq("company_id", company.id);
  if (error) back(`/dashboard/areas/${id}`, "error", "This area has customers, so it can't be deleted. Turn it off instead.");
  revalidatePath("/dashboard", "layout");
  back("/dashboard/areas", "notice", "Area deleted.");
}

export async function addBlackout(formData: FormData) {
  const { supabase } = await requireCompany();
  const areaId = str(formData, "area_id");
  const date = str(formData, "date");
  const here = `/dashboard/areas/${areaId}`;
  if (!isValidDate(date)) back(here, "error", "Pick a date.");
  // RLS only lets members write blackouts for their own company's areas.
  const { error } = await supabase.from("area_blackout_dates").upsert({ area_id: areaId, date }, { onConflict: "area_id,date", ignoreDuplicates: true });
  if (error) back(here, "error", "Could not add that date.");
  revalidatePath(here);
  redirect(here);
}

export async function removeBlackout(formData: FormData) {
  const { supabase } = await requireCompany();
  const areaId = str(formData, "area_id");
  await supabase.from("area_blackout_dates").delete().eq("area_id", areaId).eq("date", str(formData, "date"));
  revalidatePath(`/dashboard/areas/${areaId}`);
  redirect(`/dashboard/areas/${areaId}`);
}

// ------------------------------------------------------------------ pricing
export async function savePrices(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const areaId = str(formData, "area_id");
  const here = `/dashboard/areas/${areaId}`;
  const [{ data: area }, { data: tiers }] = await Promise.all([
    supabase.from("service_areas").select("id").eq("id", areaId).eq("company_id", company.id).maybeSingle(),
    supabase.from("lawn_size_tiers").select("id").eq("company_id", company.id),
  ]);
  if (!area) back("/dashboard/areas", "error", "Area not found.");

  const upserts: (MowingPrice & { company_id: string })[] = [];
  const clears: { tier_id: string; frequency: Frequency }[] = [];
  for (const tier of tiers ?? []) {
    for (const frequency of FREQUENCIES) {
      const raw = str(formData, `price:${tier.id}:${frequency}`);
      if (raw === "") {
        clears.push({ tier_id: tier.id, frequency });
        continue;
      }
      const cents = parseMoney(raw);
      if (cents === null) back(here, "error", `"${raw}" isn't a valid price.`);
      upserts.push({ company_id: company.id, area_id: areaId, tier_id: tier.id, frequency, price_cents: cents });
    }
  }
  if (upserts.length) {
    const { error } = await supabase.from("mowing_prices").upsert(upserts, { onConflict: "area_id,tier_id,frequency" });
    if (error) back(here, "error", "Could not save prices.");
  }
  for (const c of clears) {
    await supabase.from("mowing_prices").delete().eq("area_id", areaId).eq("tier_id", c.tier_id).eq("frequency", c.frequency);
  }
  revalidatePath("/dashboard", "layout");
  back(here, "notice", "Prices saved.");
}

export async function saveTier(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const id = str(formData, "id");
  const name = str(formData, "name");
  const min = Number(str(formData, "min_sqft") || "0");
  const maxRaw = str(formData, "max_sqft");
  const max = maxRaw === "" ? null : Number(maxRaw);
  const here = "/dashboard/pricing";
  if (!name) back(here, "error", "Give the size a name.");
  if (!Number.isInteger(min) || min < 0) back(here, "error", "Minimum must be a whole number of square feet.");
  if (max !== null && (!Number.isInteger(max) || max <= min)) back(here, "error", "Maximum must be larger than the minimum (or blank for no upper limit).");
  const row = { name, min_sqft: min, max_sqft: max };
  const { error } = id
    ? await supabase.from("lawn_size_tiers").update(row).eq("id", id).eq("company_id", company.id)
    : await supabase.from("lawn_size_tiers").insert({ ...row, company_id: company.id });
  if (error) back(here, "error", "Could not save the size.");
  revalidatePath(here);
  back(here, "notice", "Lawn size saved.");
}

export async function deleteTier(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const { count } = await supabase.from("lawn_size_tiers").select("id", { count: "exact", head: true }).eq("company_id", company.id);
  if ((count ?? 0) <= 1) back("/dashboard/pricing", "error", "Keep at least one lawn size.");
  await supabase.from("lawn_size_tiers").delete().eq("id", str(formData, "id")).eq("company_id", company.id);
  revalidatePath("/dashboard/pricing");
  back("/dashboard/pricing", "notice", "Lawn size deleted, along with its prices.");
}

// ------------------------------------------------------------------ add-ons
export async function saveAddon(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const id = str(formData, "id");
  const here = "/dashboard/services";
  const name = str(formData, "name");
  const cents = parseMoney(str(formData, "price"));
  if (!name) back(here, "error", "Give the service a name.");
  if (cents === null) back(here, "error", "Enter a price, like 75 or 75.00.");
  const row = { name, description: str(formData, "description") || null, price_cents: cents };
  const { error } = id
    ? await supabase.from("addon_services").update({ ...row, active: formData.get("active") !== null }).eq("id", id).eq("company_id", company.id)
    : await supabase.from("addon_services").insert({ ...row, company_id: company.id });
  if (error) back(here, "error", "Could not save the service.");
  revalidatePath(here);
  back(here, "notice", "Service saved.");
}

export async function deleteAddon(formData: FormData) {
  const { company, supabase } = await requireCompany();
  await supabase.from("addon_services").delete().eq("id", str(formData, "id")).eq("company_id", company.id);
  revalidatePath("/dashboard/services");
  back("/dashboard/services", "notice", "Service deleted.");
}

// ----------------------------------------------------------- schedule/orders
export async function setVisitStatus(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const status = str(formData, "status");
  if (!["scheduled", "completed", "skipped"].includes(status)) return;
  await supabase.from("visits").update({ status }).eq("id", str(formData, "id")).eq("company_id", company.id);
  revalidatePath("/dashboard", "layout");
}

export async function setOrderStatus(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const status = str(formData, "status");
  if (!["paid", "completed"].includes(status)) return;
  // Only paid orders can be completed (and un-completed); unpaid ones stay pending.
  await supabase.from("addon_orders").update({ status }).eq("id", str(formData, "id")).eq("company_id", company.id).in("status", ["paid", "completed"]);
  revalidatePath("/dashboard", "layout");
}

// ---------------------------------------------------------------- customers
/** Correct a customer's lawn size; re-prices their subscription from the next bill. */
export async function setCustomerTier(formData: FormData) {
  const { company, supabase } = await requireCompany();
  const customerId = str(formData, "customer_id");
  const tierId = str(formData, "tier_id");
  const here = `/dashboard/customers/${customerId}`;
  const admin = createAdminClient();

  const [{ data: tier }, { data: customer }] = await Promise.all([
    supabase.from("lawn_size_tiers").select("id, name").eq("id", tierId).eq("company_id", company.id).maybeSingle(),
    supabase.from("customers").select("id, tier_id").eq("id", customerId).eq("company_id", company.id).maybeSingle(),
  ]);
  if (!tier || !customer) back(here, "error", "Customer or lawn size not found.");
  if (customer.tier_id === tier.id) redirect(here);

  const { data: subRow } = await supabase
    .from("subscriptions").select("*").eq("customer_id", customerId).in("status", ["active", "past_due"]).maybeSingle();
  const sub = subRow as Subscription | null;

  if (sub) {
    const { data: prices } = await supabase.from("mowing_prices").select("*").eq("area_id", sub.area_id);
    const newPrice = priceFor((prices ?? []) as MowingPrice[], sub.area_id, tier.id, sub.frequency);
    if (newPrice === null) back(here, "error", `Set a ${tier.name} price for this customer's area and plan first.`);
    if (newPrice !== sub.price_cents) {
      if (!sub.stripe_subscription_id || !company.stripe_account_id) back(here, "error", "This subscription isn't linked to Stripe.");
      try {
        const opts = { stripeAccount: company.stripe_account_id };
        const current = await stripe().subscriptions.retrieve(sub.stripe_subscription_id, {}, opts);
        const item = current.items.data.find((i) => i.price.recurring);
        if (!item) throw new Error("no recurring item");
        const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
        // Same billing interval, so the cycle is unchanged; the new price applies from the next bill.
        await stripe().subscriptions.update(
          sub.stripe_subscription_id,
          {
            items: [{ id: item.id, price_data: { currency: item.price.currency, product, unit_amount: newPrice, recurring: stripeInterval(sub.frequency) } }],
            proration_behavior: "none",
          },
          opts,
        );
      } catch (err) {
        console.error("re-price failed", err);
        back(here, "error", "Stripe would not update the subscription price. Nothing was changed.");
      }
      await admin.from("subscriptions").update({ price_cents: newPrice }).eq("id", sub.id).eq("company_id", company.id);
    }
  }
  await admin.from("customers").update({ tier_id: tier.id }).eq("id", customerId).eq("company_id", company.id);
  revalidatePath(here);
  back(here, "notice", sub ? "Lawn size updated. The new price applies from the next bill." : "Lawn size updated.");
}

// ----------------------------------------------------------------- settings
export async function saveSettings(formData: FormData) {
  const { company } = await requireCompany();
  const here = "/dashboard/settings";
  const name = str(formData, "name");
  const color = str(formData, "brand_color");
  const logo = str(formData, "logo_url");
  if (name.length < 2) back(here, "error", "Enter your company name.");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) back(here, "error", "Pick a brand colour.");
  if (logo && !/^https:\/\/\S+$/.test(logo)) back(here, "error", "Logo must be an https:// image link.");
  const { error } = await createAdminClient()
    .from("companies")
    .update({ name, brand_color: color, logo_url: logo || null, tagline: str(formData, "tagline") || null, phone: str(formData, "phone") || null })
    .eq("id", company.id);
  if (error) back(here, "error", "Could not save settings.");
  revalidatePath("/dashboard", "layout");
  back(here, "notice", "Settings saved.");
}

// ------------------------------------------------------------------- stripe
export async function connectStripe() {
  const { company, user } = await requireCompany();
  const here = "/dashboard/settings";
  if (!stripeConfigured()) back(here, "error", "Stripe isn't configured on this server yet (STRIPE_SECRET_KEY).");
  let accountId = company.stripe_account_id;
  let url: string;
  try {
    if (!accountId) {
      const account = await stripe().accounts.create({
        type: "standard",
        email: user.email,
        business_profile: { name: company.name },
        metadata: { company_id: company.id },
      });
      accountId = account.id;
      await createAdminClient().from("companies").update({ stripe_account_id: accountId }).eq("id", company.id);
    }
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: platformUrl("/dashboard/settings?stripe=refresh"),
      return_url: platformUrl("/dashboard/settings?stripe=return"),
    });
    url = link.url;
  } catch (err) {
    console.error("Stripe connect failed", err);
    back(here, "error", "Could not start Stripe onboarding. Check that Connect is enabled on the platform account.");
  }
  redirect(url);
}

/** Re-read the connected account from Stripe (also done by the account.updated webhook). */
export async function refreshStripeStatus(): Promise<boolean> {
  const { company } = await requireCompany();
  if (!company.stripe_account_id || !stripeConfigured()) return false;
  try {
    const account = await stripe().accounts.retrieve(company.stripe_account_id);
    const enabled = Boolean(account.charges_enabled);
    if (enabled !== company.stripe_charges_enabled) {
      await createAdminClient().from("companies").update({ stripe_charges_enabled: enabled }).eq("id", company.id);
    }
    return enabled;
  } catch (err) {
    console.error("Stripe status check failed", err);
    return company.stripe_charges_enabled;
  }
}

// ------------------------------------------------------------------ domains
export async function addCustomDomain(formData: FormData) {
  const { company } = await requireCompany();
  const here = "/dashboard/settings";
  const domain = normalizeDomain(str(formData, "domain"));
  if (!domain) back(here, "error", "Enter a domain like lawns.example.com.");
  const admin = createAdminClient();
  const { data: existing } = await admin.from("company_domains").select("company_id").eq("domain", domain).maybeSingle();
  if (existing) back(here, "error", existing.company_id === company.id ? "That domain is already added." : "That domain is in use by another company.");

  let verified = false;
  if (vercelConfigured()) {
    const status = await addDomain(domain);
    if (status.error) back(here, "error", status.error);
    verified = status.verified;
  }
  const { error } = await admin.from("company_domains").insert({ company_id: company.id, domain, verified });
  if (error) back(here, "error", "Could not add the domain.");
  revalidatePath(here);
  back(here, "notice", verified ? "Domain connected." : "Domain added. Create the DNS records shown below, then check again.");
}

export async function verifyCustomDomain(formData: FormData) {
  const { company } = await requireCompany();
  const here = "/dashboard/settings";
  const admin = createAdminClient();
  const { data: row } = await admin.from("company_domains").select("id, domain").eq("id", str(formData, "id")).eq("company_id", company.id).maybeSingle();
  if (!row) back(here, "error", "Domain not found.");
  if (!vercelConfigured()) back(here, "error", "Domain hosting isn't configured on this server yet (VERCEL_API_TOKEN, VERCEL_PROJECT_ID).");
  const status = await checkDomain(row.domain);
  await admin.from("company_domains").update({ verified: status.verified }).eq("id", row.id);
  revalidatePath(here);
  back(here, status.verified ? "notice" : "error", status.verified ? "Domain connected." : "DNS isn't pointing here yet. Changes can take up to an hour to spread.");
}

export async function removeCustomDomain(formData: FormData) {
  const { company } = await requireCompany();
  const admin = createAdminClient();
  const { data: row } = await admin.from("company_domains").select("id, domain").eq("id", str(formData, "id")).eq("company_id", company.id).maybeSingle();
  if (row) {
    if (vercelConfigured()) await removeDomain(row.domain);
    await admin.from("company_domains").delete().eq("id", row.id);
  }
  revalidatePath("/dashboard/settings");
  back("/dashboard/settings", "notice", "Domain removed.");
}
