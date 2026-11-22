import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { PageHeader, formatDay } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCompany } from "@/lib/auth";
import { formatMoney } from "@/lib/pricing";
import { today } from "@/lib/schedule";
import { FREQUENCY_LABEL, type AddonOrder, type Customer, type LawnTier, type Subscription, type Visit } from "@/lib/types";
import { setCustomerTier } from "../../actions";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const { company, supabase } = await requireCompany();
  const msg = await readNotice(searchParams);
  const { data: c } = await supabase.from("customers").select("*, service_areas(name)").eq("id", id).eq("company_id", company.id).maybeSingle();
  if (!c) notFound();
  const customer = c as Customer & { service_areas: { name: string } | null };
  const [{ data: tiers }, { data: subs }, { data: visits }, { data: orders }] = await Promise.all([
    supabase.from("lawn_size_tiers").select("*").eq("company_id", company.id).order("min_sqft"),
    supabase.from("subscriptions").select("*").eq("customer_id", id).neq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("visits").select("*").eq("customer_id", id).gte("visit_date", today()).order("visit_date").limit(8),
    supabase.from("addon_orders").select("*").eq("customer_id", id).neq("status", "pending").order("created_at", { ascending: false }),
  ]);
  const sub = ((subs ?? []) as Subscription[])[0];

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/dashboard/customers" className="text-brand hover:underline">← Customers</Link></p>
      <PageHeader title={customer.full_name} subtitle={customer.address} action={<StatusBadge status={sub?.status} />} />
      <Notice {...msg} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold text-gray-900">Details</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row k="Email" v={<a className="text-brand hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a>} />
            <Row k="Phone" v={customer.phone ? <a className="text-brand hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a> : "—"} />
            <Row k="Area" v={customer.service_areas?.name ?? "—"} />
            <Row k="Plan" v={sub && sub.status !== "canceled" ? `${FREQUENCY_LABEL[sub.frequency]} · ${formatMoney(sub.price_cents)} per visit` : "—"} />
            <Row k="Started" v={sub ? formatDay(sub.start_date, { month: "short", day: "numeric", year: "numeric" }) : "—"} />
          </dl>
        </section>
        <section className="card">
          <h2 className="font-semibold text-gray-900">Lawn size</h2>
          <p className="mt-1 text-sm text-gray-600">
            {customer.lawn_sqft ? `Customer traced ${customer.lawn_sqft.toLocaleString()} sq ft.` : "Customer picked a size without tracing."}{" "}
            Change it if it&apos;s wrong — the new price applies from their next bill.
          </p>
          <form action={setCustomerTier} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="customer_id" value={customer.id} />
            <div>
              <label className="label" htmlFor="tier_id">Size</label>
              <select className="input" id="tier_id" name="tier_id" defaultValue={customer.tier_id ?? ""} required>
                {!customer.tier_id && <option value="" disabled>Choose…</option>}
                {((tiers ?? []) as LawnTier[]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <SubmitButton className="btn-outline" pendingText="Updating…">Update size</SubmitButton>
          </form>
        </section>
        <section className="card">
          <h2 className="font-semibold text-gray-900">Upcoming visits</h2>
          {((visits ?? []) as Visit[]).length === 0 ? <p className="mt-2 text-sm text-gray-600">None scheduled.</p> : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {((visits ?? []) as Visit[]).map((v) => (
                <li key={v.id} className="flex justify-between py-2">
                  <Link href={`/dashboard/schedule?date=${v.visit_date}`} className="hover:underline">{formatDay(v.visit_date)}</Link>
                  <span className="capitalize text-gray-600">{v.status === "completed" ? "Done" : v.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="font-semibold text-gray-900">Extra services</h2>
          {((orders ?? []) as AddonOrder[]).length === 0 ? <p className="mt-2 text-sm text-gray-600">None ordered.</p> : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {((orders ?? []) as AddonOrder[]).map((o) => (
                <li key={o.id} className="flex justify-between py-2">
                  <span>{o.name} · {formatMoney(o.price_cents)}</span>
                  <span className="text-gray-600">{o.status === "paid" ? "Paid, to do" : o.status === "completed" ? "Done" : "Canceled"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-600">{k}</dt>
      <dd className="text-right text-gray-900">{v}</dd>
    </div>
  );
}
