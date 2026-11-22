import Link from "next/link";
import { PageHeader, formatDay } from "@/components/PageHeader";
import { requireCompany } from "@/lib/auth";
import { storefrontUrl } from "@/lib/hosts";
import { formatMoney, monthlyValue } from "@/lib/pricing";
import { addDays, today } from "@/lib/schedule";
import type { Frequency } from "@/lib/types";

export default async function Overview() {
  const { company, supabase } = await requireCompany();
  const now = today();
  const [areas, prices, subs, visits, domains, orders] = await Promise.all([
    supabase.from("service_areas").select("id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("mowing_prices").select("area_id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("subscriptions").select("frequency, price_cents, status").eq("company_id", company.id).in("status", ["active", "past_due"]),
    supabase.from("visits").select("visit_date").eq("company_id", company.id).eq("status", "scheduled").gte("visit_date", now).lte("visit_date", addDays(now, 6)),
    supabase.from("company_domains").select("id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("addon_orders").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "paid"),
  ]);
  const active = (subs.data ?? []).filter((s) => s.status === "active");
  const pastDue = (subs.data ?? []).length - active.length;
  const mrr = active.reduce((sum, s) => sum + monthlyValue(s.frequency as Frequency, s.price_cents), 0);
  const byDay = new Map<string, number>();
  for (const v of visits.data ?? []) byDay.set(v.visit_date, (byDay.get(v.visit_date) ?? 0) + 1);

  const steps = [
    { done: company.stripe_charges_enabled, label: "Connect Stripe to get paid", href: "/dashboard/settings" },
    { done: (areas.count ?? 0) > 0, label: "Draw your first service area", href: "/dashboard/areas/new" },
    { done: (prices.count ?? 0) > 0, label: "Set mowing prices", href: "/dashboard/areas" },
    { done: (domains.count ?? 0) > 0, label: "Add your own domain (optional)", href: "/dashboard/settings" },
  ];
  const ready = steps.slice(0, 3).every((s) => s.done);

  return (
    <>
      <PageHeader title={company.name} subtitle="Here's how the business is doing." />
      {!ready && (
        <div className="card mb-6 border-brand-line bg-brand-soft">
          <h2 className="font-semibold text-gray-900">Finish setting up</h2>
          <p className="text-sm text-gray-600">Customers can sign up once the first three steps are done.</p>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-brand text-white" : "border border-gray-400 bg-white text-transparent"}`}>✓</span>
                {s.done ? <span className="text-gray-500 line-through">{s.label}</span> : <Link href={s.href} className="font-medium text-brand-dark hover:underline">{s.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active subscribers" value={String(active.length)} />
        <Stat label="Monthly recurring revenue" value={formatMoney(mrr)} hint="approximate" />
        <Stat label="Visits next 7 days" value={String(visits.data?.length ?? 0)} />
        <Stat label="Extra services to do" value={String(orders.count ?? 0)} href="/dashboard/schedule" />
      </div>
      {pastDue > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pastDue} subscription{pastDue === 1 ? " has" : "s have"} a failed payment. <Link href="/dashboard/customers" className="underline">Review customers</Link>
        </p>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold text-gray-900">This week</h2>
          {byDay.size === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No visits scheduled in the next 7 days.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {[...byDay.entries()].sort().map(([date, n]) => (
                <li key={date} className="flex justify-between py-2">
                  <Link href={`/dashboard/schedule?date=${date}`} className="text-brand-dark hover:underline">{formatDay(date)}</Link>
                  <span className="text-gray-600">{n} visit{n === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-900">Your customer sign-up link</h2>
          <p className="mt-2 break-all text-sm"><a className="text-brand hover:underline" href={storefrontUrl(company.slug)} target="_blank" rel="noreferrer">{storefrontUrl(company.slug)}</a></p>
          <p className="mt-2 text-sm text-gray-600">Share it on your trucks, flyers and social pages.</p>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <div className="card h-full">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
