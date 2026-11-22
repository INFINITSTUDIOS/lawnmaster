import { redirect } from "next/navigation";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { getCustomer, getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/tenant";
import { Wizard } from "./Wizard";

export default async function SignupPage({ searchParams }: { searchParams: Search }) {
  const company = await requireTenant();
  const msg = await readNotice(searchParams);
  const user = await getUser();
  const customer = user ? await getCustomer(company.id) : null;
  const db = createAdminClient();
  if (customer) {
    const { data: live } = await db.from("subscriptions").select("id").eq("customer_id", customer.id).in("status", ["active", "past_due"]).limit(1);
    if (live?.length) redirect("/account");
  }
  const { data: addons } = await db.from("addon_services").select("id, name, description, price_cents").eq("company_id", company.id).eq("active", true).order("created_at");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Sign up for mowing</h1>
      <Notice {...msg} />
      {company.stripe_charges_enabled ? (
        <Wizard
          companyName={company.name}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null}
          addons={addons ?? []}
          center={company.map_center_lng !== null && company.map_center_lat !== null ? [company.map_center_lng, company.map_center_lat] : null}
          signedInEmail={user?.email ?? null}
          defaultName={customer?.full_name ?? String(user?.user_metadata?.full_name ?? "")}
        />
      ) : (
        <p className="card text-sm text-gray-700">
          {company.name} isn&apos;t taking online sign-ups yet.{company.phone ? ` Call ${company.phone} to get on the schedule.` : " Please check back soon."}
        </p>
      )}
    </div>
  );
}
