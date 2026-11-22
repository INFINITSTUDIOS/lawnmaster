import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { Company, Customer } from "./types";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/**
 * For dashboard pages and actions: the signed-in manager, their company, and a
 * user-scoped Supabase client. Redirects to login / onboarding when missing.
 */
export const requireCompany = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");
  const { data: membership } = await supabase
    .from("company_members")
    .select("role, companies(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const company = (membership as unknown as { companies: Company } | null)?.companies;
  if (!company) redirect("/onboarding");
  return { user, company, supabase };
});

/** The signed-in user's customer record with this company, if any. */
export async function getCustomer(companyId: string): Promise<Customer | null> {
  const user = await getUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as Customer | null) ?? null;
}
