import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { formatDay } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { getCustomer, getUser } from "@/lib/auth";
import { formatMoney } from "@/lib/pricing";
import { today } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/tenant";
import { FREQUENCY_LABEL, type Addon, type AddonOrder, type Subscription, type Visit } from "@/lib/types";
import { cancelPlan, customerLogOut, openBillingPortal, orderAddon } from "../actions";

export default async function AccountPage({ searchParams }: { searchParams: Search }) {
  const company = await requireTenant();
  const user = await getUser();
  if (!user) redirect("/login");
  const customer = await getCustomer(company.id);
  const msg = await readNotice(searchParams);

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">You don&apos;t have a plan with {company.name} yet</h1>
        <Link href="/signup" className="btn mt-6">Sign up for mowing</Link>
        <form action={customerLogOut} className="mt-4"><button className="text-sm text-gray-600 underline">Log out</button></form>
      </div>
    );
  }

  const db = createAdminClient();
  const [{ data: subs }, { data: visits }, { data: orders }, { data: addons }] = await Promise.all([
    db.from("subscriptions").select("*").eq("customer_id", customer.id).neq("status", "pending").order("created_at", { ascending: false }).limit(1),
    db.from("visits").select("*").eq("customer_id", customer.id).eq("status", "scheduled").gte("visit_date", today()).order("visit_date").limit(6),
    db.from("addon_orders").select("*").eq("customer_id", customer.id).in("status", ["paid", "completed"]).order("created_at", { ascending: false }).limit(10),
    db.from("addon_services").select("*").eq("company_id", company.id).eq("active", true).order("created_at"),
  ]);
  const sub = ((subs ?? []) as Subscription[])[0];
  const live = sub && sub.status !== "canceled";
  const upcoming = (visits ?? []) as Visit[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hi, {customer.full_name.split(" ")[0]}</h1>
          <p className="text-sm text-gray-600">{customer.address}</p>
        </div>
        <form action={customerLogOut}><button className="btn-outline">Log out</button></form>
      </div>
      <Notice {...msg} />

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Your mowing plan</h2>
          <StatusBadge status={sub?.status} />
        </div>
        {live ? (
          <>
            <p className="mt-2 text-gray-900">
              <span className="text-2xl font-bold text-brand-dark">{formatMoney(sub.price_cents)}</span> per visit · {FREQUENCY_LABEL[sub.frequency].toLowerCase()}
            </p>
            {sub.status === "past_due" && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Your last payment didn&apos;t go through. Update your card to keep your visits.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <form action={openBillingPortal}><SubmitButton className="btn-outline" pendingText="Opening…">Update card &amp; invoices</SubmitButton></form>
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600 underline">Cancel plan</summary>
                <form action={cancelPlan} className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-red-900">This stops all future visits and charges right away.</p>
                  <SubmitButton className="btn-danger mt-2" pendingText="Canceling…">Yes, cancel my plan</SubmitButton>
                </form>
              </details>
            </div>
          </>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-gray-600">{sub ? "Your plan was canceled." : "You haven't finished signing up."}</p>
            <Link href="/signup" className="btn mt-3">{sub ? "Start a new plan" : "Finish signing up"}</Link>
          </div>
        )}
      </section>

      {live && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming visits</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No visits scheduled yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {upcoming.map((v, i) => (
                <li key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-gray-900">{formatDay(v.visit_date, { weekday: "long", month: "long", day: "numeric" })}</span>
                  {i === 0 && <span className="badge">Next</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {((addons ?? []) as Addon[]).length > 0 && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Add an extra service</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {((addons ?? []) as Addon[]).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{a.name}</p>
                  {a.description && <p className="text-sm text-gray-600">{a.description}</p>}
                </div>
                <form action={orderAddon}>
                  <input type="hidden" name="addon_id" value={a.id} />
                  <SubmitButton className="btn-outline" pendingText="Opening…">Order · {formatMoney(a.price_cents)}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {((orders ?? []) as AddonOrder[]).length > 0 && (
        <section className="card mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Your extra services</h2>
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {((orders ?? []) as AddonOrder[]).map((o) => (
              <li key={o.id} className="flex justify-between py-2.5">
                <span>{o.name} · {formatMoney(o.price_cents)}</span>
                <span className="text-gray-600">{o.status === "completed" ? "Done" : "Paid — we'll be in touch to schedule"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
