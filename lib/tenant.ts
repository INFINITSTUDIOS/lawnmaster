import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { classifyHost } from "./hosts";
import { createAdminClient } from "./supabase/admin";
import type { Company } from "./types";

const COMPANY_COLUMNS =
  "id, name, slug, tagline, phone, logo_url, brand_color, map_center_lng, map_center_lat, stripe_account_id, stripe_charges_enabled, platform_fee_percent";

export const companyForHost = cache(async (host: string): Promise<Company | null> => {
  const kind = classifyHost(host);
  if (kind.kind === "platform") return null;
  const db = createAdminClient();
  if (kind.kind === "tenant-slug") {
    const { data } = await db.from("companies").select(COMPANY_COLUMNS).eq("slug", kind.slug).maybeSingle();
    return (data as Company | null) ?? null;
  }
  const { data } = await db
    .from("company_domains")
    .select(`companies(${COMPANY_COLUMNS})`)
    .eq("domain", kind.domain)
    .eq("verified", true)
    .maybeSingle();
  return ((data as unknown as { companies: Company } | null)?.companies as Company | undefined) ?? null;
});

/** The company whose storefront this request is for, from the Host header. */
export async function getTenant(): Promise<Company | null> {
  const h = await headers();
  return companyForHost(h.get("host") ?? "");
}

export async function requireTenant(): Promise<Company> {
  const company = await getTenant();
  if (!company) notFound();
  return company;
}

/** Origin (protocol + host) of the current request, for building return URLs. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
