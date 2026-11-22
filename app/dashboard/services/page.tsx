import { Notice, readNotice, type Search } from "@/components/Notice";
import { Empty, PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCompany } from "@/lib/auth";
import type { Addon } from "@/lib/types";
import { deleteAddon, saveAddon } from "../actions";

export default async function ServicesPage({ searchParams }: { searchParams: Search }) {
  const { company, supabase } = await requireCompany();
  const msg = await readNotice(searchParams);
  const { data: addons } = await supabase.from("addon_services").select("*").eq("company_id", company.id).order("created_at");
  return (
    <>
      <PageHeader title="Extra services" subtitle="One-off jobs at a flat rate — tree trimming, waste removal, aeration. Customers can add them at sign-up or any time after." />
      <Notice {...msg} />
      {(addons ?? []).length === 0 && <Empty>No extra services yet. Add your first one below.</Empty>}
      <div className="space-y-3">
        {((addons ?? []) as Addon[]).map((a) => (
          <div key={a.id} className="card">
            <form action={saveAddon} className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <input type="hidden" name="id" value={a.id} />
              <AddonFields addon={a} />
              <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={a.active} className="accent-[var(--brand)]" /> Offered to customers
                </label>
                <SubmitButton className="btn-outline">Save</SubmitButton>
                <button formAction={deleteAddon} className="btn-danger">Delete</button>
              </div>
            </form>
          </div>
        ))}
      </div>
      <h2 className="mb-2 mt-8 text-lg font-semibold text-gray-900">Add a service</h2>
      <form action={saveAddon} className="card grid gap-3 sm:grid-cols-[1fr_8rem]">
        <AddonFields />
        <div className="sm:col-span-2"><SubmitButton>Add service</SubmitButton></div>
      </form>
    </>
  );
}

function AddonFields({ addon }: { addon?: Addon }) {
  const k = addon?.id ?? "new";
  return (
    <>
      <div>
        <label className="label" htmlFor={`name-${k}`}>Service</label>
        <input className="input" id={`name-${k}`} name="name" required maxLength={80} defaultValue={addon?.name} placeholder="e.g. Tree trimming" />
      </div>
      <div>
        <label className="label" htmlFor={`price-${k}`}>Flat price ($)</label>
        <input className="input" id={`price-${k}`} name="price" required inputMode="decimal" defaultValue={addon ? (addon.price_cents / 100).toFixed(addon.price_cents % 100 ? 2 : 0) : ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`desc-${k}`}>Description (optional)</label>
        <input className="input" id={`desc-${k}`} name="description" maxLength={200} defaultValue={addon?.description ?? ""} placeholder="What's included" />
      </div>
    </>
  );
}
