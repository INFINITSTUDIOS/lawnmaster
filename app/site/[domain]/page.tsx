import Link from "next/link";
import { formatMoney } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/tenant";
import { FREQUENCIES, FREQUENCY_LABEL, type Addon, type Frequency } from "@/lib/types";

export default async function StorefrontHome() {
  const company = await requireTenant();
  const db = createAdminClient();
  const [{ data: prices }, { data: addons }, { data: areas }] = await Promise.all([
    db.from("mowing_prices").select("frequency, price_cents, service_areas!inner(active)").eq("company_id", company.id).eq("service_areas.active", true),
    db.from("addon_services").select("*").eq("company_id", company.id).eq("active", true).order("created_at"),
    db.from("service_areas").select("name").eq("company_id", company.id).eq("active", true).order("name"),
  ]);
  const from = new Map<Frequency, number>();
  for (const p of prices ?? []) {
    const f = p.frequency as Frequency;
    from.set(f, Math.min(from.get(f) ?? Infinity, p.price_cents));
  }
  const open = company.stripe_charges_enabled && from.size > 0;

  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft to-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {company.tagline || "A great-looking lawn, on a schedule that suits you."}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            Enter your address, pick how often we mow, and choose your first day. It takes about two minutes.
          </p>
          {open ? (
            <Link href="/signup" className="btn mt-8 px-7 py-3 text-base">Check my address</Link>
          ) : (
            <p className="mx-auto mt-8 max-w-md rounded-lg border border-brand-line bg-white px-4 py-3 text-sm text-gray-700">
              Online sign-up is opening soon.{company.phone ? ` Call us on ${company.phone} in the meantime.` : ""}
            </p>
          )}
        </div>
      </section>

      {from.size > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-center text-2xl font-bold text-gray-900">Mowing plans</h2>
          <p className="mt-1 text-center text-sm text-gray-600">Your exact price depends on your neighborhood and lawn size.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FREQUENCIES.filter((f) => from.has(f)).map((f) => (
              <div key={f} className="card text-center">
                <h3 className="font-semibold text-gray-900">{FREQUENCY_LABEL[f]}</h3>
                <p className="mt-2 text-sm text-gray-500">from</p>
                <p className="text-3xl font-bold text-brand-dark">{formatMoney(from.get(f)!)}</p>
                <p className="text-sm text-gray-500">per visit</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(addons ?? []).length > 0 && (
        <section className="bg-brand-soft">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-center text-2xl font-bold text-gray-900">Extra services</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {((addons ?? []) as Addon[]).map((a) => (
                <div key={a.id} className="card">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold text-gray-900">{a.name}</h3>
                    <span className="font-semibold text-brand-dark">{formatMoney(a.price_cents)}</span>
                  </div>
                  {a.description && <p className="mt-1 text-sm text-gray-600">{a.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {(areas ?? []).length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-14 text-center">
          <h2 className="text-2xl font-bold text-gray-900">Where we work</h2>
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {(areas ?? []).map((a) => <li key={a.name} className="badge px-3 py-1 text-sm">{a.name}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
