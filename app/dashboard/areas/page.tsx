import Link from "next/link";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { Empty, PageHeader } from "@/components/PageHeader";
import { requireCompany } from "@/lib/auth";
import { FREQUENCIES, WEEKDAY_NAMES, type ServiceArea } from "@/lib/types";

export default async function AreasPage({ searchParams }: { searchParams: Search }) {
  const { company, supabase } = await requireCompany();
  const msg = await readNotice(searchParams);
  const [{ data: areas }, { data: prices }, { count: tierCount }] = await Promise.all([
    supabase.from("service_areas").select("*").eq("company_id", company.id).order("created_at"),
    supabase.from("mowing_prices").select("area_id").eq("company_id", company.id),
    supabase.from("lawn_size_tiers").select("id", { count: "exact", head: true }).eq("company_id", company.id),
  ]);
  const total = (tierCount ?? 0) * FREQUENCIES.length;
  return (
    <>
      <PageHeader
        title="Service areas"
        subtitle="The neighborhoods you mow, the days you're there, and what you charge."
        action={<Link href="/dashboard/areas/new" className="btn">Add area</Link>}
      />
      <Notice {...msg} />
      {(areas ?? []).length === 0 ? (
        <Empty>No service areas yet. <Link href="/dashboard/areas/new" className="font-medium text-brand hover:underline">Draw your first one</Link> so customers in it can sign up.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(areas as ServiceArea[]).map((a) => {
            const set = (prices ?? []).filter((p) => p.area_id === a.id).length;
            return (
              <Link key={a.id} href={`/dashboard/areas/${a.id}`} className="card block hover:border-brand-line">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-gray-900">{a.name}</h2>
                  {!a.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Off</span>}
                </div>
                <p className="mt-1 text-sm text-gray-600">{a.service_weekdays.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(", ") || "No service days"}</p>
                <p className={`mt-1 text-sm ${set === 0 ? "text-amber-700" : "text-gray-600"}`}>
                  {set === 0 ? "No prices set — customers can't sign up here yet" : `${set} of ${total} prices set`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
