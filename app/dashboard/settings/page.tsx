import { Notice, readNotice, type Search } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCompany } from "@/lib/auth";
import { storefrontUrl } from "@/lib/hosts";
import { dnsRecordsFor, vercelConfigured } from "@/lib/vercel-domains";
import { addCustomDomain, connectStripe, refreshStripeStatus, removeCustomDomain, saveSettings, verifyCustomDomain } from "../actions";

export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const { company, supabase } = await requireCompany();
  const sp = await searchParams;
  const msg = await readNotice(searchParams);
  // Coming back from Stripe onboarding: re-read the account right away.
  let chargesEnabled = company.stripe_charges_enabled;
  if (sp.stripe === "return" || (company.stripe_account_id && !chargesEnabled)) chargesEnabled = await refreshStripeStatus();
  const { data: domains } = await supabase.from("company_domains").select("id, domain, verified").eq("company_id", company.id).order("created_at");

  return (
    <>
      <PageHeader title="Settings" />
      <Notice {...msg} />

      <section className="card">
        <h2 className="text-lg font-semibold text-gray-900">Payments</h2>
        {chargesEnabled ? (
          <p className="mt-1 text-sm text-gray-700"><span className="badge mr-2">Connected</span>Customer payments go straight to your Stripe account.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-600">
              {company.stripe_account_id
                ? "Your Stripe account isn't ready to take payments yet. Finish the Stripe setup to start accepting customers."
                : "Connect your own Stripe account. Customers pay you directly; LawnMaster never holds your money."}
            </p>
            <form action={connectStripe} className="mt-3">
              <SubmitButton pendingText="Opening Stripe…">{company.stripe_account_id ? "Finish Stripe setup" : "Connect Stripe"}</SubmitButton>
            </form>
          </>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-gray-900">Your website</h2>
        <p className="mt-1 text-sm text-gray-600">
          Your customer site is always available at{" "}
          <a className="text-brand hover:underline" href={storefrontUrl(company.slug)} target="_blank" rel="noreferrer">{storefrontUrl(company.slug)}</a>.
          Add your own domain to use it instead.
        </p>
        {!vercelConfigured() && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Custom-domain hosting isn&apos;t configured on this server yet, so domains you add won&apos;t go live.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {(domains ?? []).map((d) => (
            <li key={d.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900">
                  {d.domain}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${d.verified ? "bg-brand-soft text-brand-dark" : "bg-amber-100 text-amber-900"}`}>
                    {d.verified ? "Live" : "Waiting for DNS"}
                  </span>
                </p>
                <div className="flex gap-2">
                  {!d.verified && (
                    <form action={verifyCustomDomain}><input type="hidden" name="id" value={d.id} /><SubmitButton className="btn-outline py-1.5" pendingText="Checking…">Check again</SubmitButton></form>
                  )}
                  <form action={removeCustomDomain}><input type="hidden" name="id" value={d.id} /><button className="btn-danger py-1.5">Remove</button></form>
                </div>
              </div>
              {!d.verified && (
                <div className="mt-2 text-sm text-gray-700">
                  <p>At your domain registrar, add this DNS record:</p>
                  <table className="mt-1 text-left font-mono text-xs">
                    <thead><tr className="text-gray-500"><th className="pr-4 font-normal">Type</th><th className="pr-4 font-normal">Name</th><th className="font-normal">Value</th></tr></thead>
                    <tbody>
                      {dnsRecordsFor(d.domain).map((r) => (
                        <tr key={r.type + r.name}><td className="pr-4">{r.type}</td><td className="pr-4">{r.name}</td><td>{r.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
        <form action={addCustomDomain} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label className="label" htmlFor="domain">Add a domain</label>
            <input className="input" id="domain" name="domain" required placeholder="lawns.yourcompany.com" />
          </div>
          <SubmitButton className="btn-outline" pendingText="Adding…">Add domain</SubmitButton>
        </form>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
        <form action={saveSettings} className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Company name</label>
            <input className="input" id="name" name="name" required minLength={2} maxLength={80} defaultValue={company.name} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone shown to customers</label>
            <input className="input" id="phone" name="phone" type="tel" maxLength={30} defaultValue={company.phone ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="tagline">Tagline</label>
            <input className="input" id="tagline" name="tagline" maxLength={140} defaultValue={company.tagline ?? ""} placeholder="Reliable mowing, every time." />
          </div>
          <div>
            <label className="label" htmlFor="logo_url">Logo image link (optional)</label>
            <input className="input" id="logo_url" name="logo_url" type="url" defaultValue={company.logo_url ?? ""} placeholder="https://…" />
          </div>
          <div>
            <label className="label" htmlFor="brand_color">Brand colour</label>
            <input className="h-10 w-20 cursor-pointer rounded-lg border border-gray-300 bg-white p-1" id="brand_color" name="brand_color" type="color" defaultValue={company.brand_color} />
          </div>
          <div className="sm:col-span-2"><SubmitButton pendingText="Saving…">Save branding</SubmitButton></div>
        </form>
      </section>
    </>
  );
}
