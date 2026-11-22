import Link from "next/link";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCompany } from "@/lib/auth";
import type { LawnTier } from "@/lib/types";
import { deleteTier, saveTier } from "../actions";

export default async function PricingPage({ searchParams }: { searchParams: Search }) {
  const { company, supabase } = await requireCompany();
  const msg = await readNotice(searchParams);
  const { data: tiers } = await supabase.from("lawn_size_tiers").select("*").eq("company_id", company.id).order("min_sqft");
  return (
    <>
      <PageHeader
        title="Lawn sizes"
        subtitle="Customers trace their lawn on a satellite map; its square footage puts them in one of these sizes. Prices for each size are set per service area."
        action={<Link href="/dashboard/areas" className="btn-outline">Set prices by area</Link>}
      />
      <Notice {...msg} />
      <div className="space-y-3">
        {((tiers ?? []) as LawnTier[]).map((t) => (
          <div key={t.id} className="card flex flex-wrap items-end gap-3">
            <form action={saveTier} className="flex flex-1 flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={t.id} />
              <TierFields tier={t} />
              <SubmitButton className="btn-outline">Save</SubmitButton>
            </form>
            <form action={deleteTier}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn-danger">Delete</button>
            </form>
          </div>
        ))}
      </div>
      <h2 className="mb-2 mt-8 text-lg font-semibold text-gray-900">Add a size</h2>
      <form action={saveTier} className="card flex flex-wrap items-end gap-3">
        <TierFields />
        <SubmitButton>Add size</SubmitButton>
      </form>
    </>
  );
}

function TierFields({ tier }: { tier?: LawnTier }) {
  const k = tier?.id ?? "new";
  return (
    <>
      <div>
        <label className="label" htmlFor={`name-${k}`}>Name</label>
        <input className="input w-40" id={`name-${k}`} name="name" required maxLength={40} defaultValue={tier?.name} placeholder="e.g. Medium" />
      </div>
      <div>
        <label className="label" htmlFor={`min-${k}`}>From (sq ft)</label>
        <input className="input w-32" id={`min-${k}`} name="min_sqft" type="number" min={0} step={1} required defaultValue={tier?.min_sqft ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`max-${k}`}>Up to (sq ft)</label>
        <input className="input w-32" id={`max-${k}`} name="max_sqft" type="number" min={1} step={1} defaultValue={tier?.max_sqft ?? ""} placeholder="No limit" />
      </div>
    </>
  );
}
