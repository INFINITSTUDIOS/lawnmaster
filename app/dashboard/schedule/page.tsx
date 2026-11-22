import Link from "next/link";
import { Empty, PageHeader, formatDay } from "@/components/PageHeader";
import { requireCompany } from "@/lib/auth";
import { formatMoney } from "@/lib/pricing";
import { addDays, isValidDate, today } from "@/lib/schedule";
import type { Search } from "@/components/Notice";
import { setOrderStatus, setVisitStatus } from "../actions";

type VisitRow = {
  id: string;
  status: "scheduled" | "completed" | "skipped";
  visit_date: string;
  original_date: string;
  customers: { id: string; full_name: string; address: string; phone: string | null } | null;
  service_areas: { name: string } | null;
};
type OrderRow = { id: string; name: string; price_cents: number; status: string; created_at: string; customers: { id: string; full_name: string; address: string } | null };

export default async function SchedulePage({ searchParams }: { searchParams: Search }) {
  const { company, supabase } = await requireCompany();
  const sp = await searchParams;
  const now = today();
  const date = typeof sp.date === "string" && isValidDate(sp.date) ? sp.date : now;
  const stripStart = date < now ? date : now;

  const [{ data: visits }, { data: upcoming }, { data: orders }] = await Promise.all([
    supabase.from("visits").select("id, status, visit_date, original_date, customers(id, full_name, address, phone), service_areas(name)").eq("company_id", company.id).eq("visit_date", date),
    supabase.from("visits").select("visit_date").eq("company_id", company.id).gte("visit_date", stripStart).lte("visit_date", addDays(stripStart, 13)).neq("status", "skipped"),
    supabase.from("addon_orders").select("id, name, price_cents, status, created_at, customers(id, full_name, address)").eq("company_id", company.id).eq("status", "paid").order("created_at"),
  ]);
  const counts = new Map<string, number>();
  for (const v of upcoming ?? []) counts.set(v.visit_date, (counts.get(v.visit_date) ?? 0) + 1);
  const rows = ((visits ?? []) as unknown as VisitRow[]).sort((a, b) =>
    (a.service_areas?.name ?? "").localeCompare(b.service_areas?.name ?? "") || (a.customers?.address ?? "").localeCompare(b.customers?.address ?? ""));
  const groups = new Map<string, VisitRow[]>();
  for (const r of rows) groups.set(r.service_areas?.name ?? "Other", [...(groups.get(r.service_areas?.name ?? "Other") ?? []), r]);

  return (
    <>
      <PageHeader title="Schedule" subtitle="Who you're mowing, day by day." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 14 }, (_, i) => addDays(stripStart, i)).map((d) => (
          <Link
            key={d}
            href={`/dashboard/schedule?date=${d}`}
            aria-current={d === date ? "date" : undefined}
            className={`min-w-[4.5rem] rounded-lg border px-2 py-2 text-center text-xs ${d === date ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-700 hover:border-brand-line"}`}
          >
            <span className="block font-medium">{formatDay(d, { weekday: "short" })}</span>
            <span className="block text-base font-bold">{formatDay(d, { day: "numeric" })}</span>
            <span className="block opacity-80">{counts.get(d) ?? 0} lawns</span>
          </Link>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Link className="btn-outline" href={`/dashboard/schedule?date=${addDays(date, -1)}`}>← Previous</Link>
        <h2 className="text-lg font-semibold text-gray-900">{formatDay(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
        <Link className="btn-outline" href={`/dashboard/schedule?date=${addDays(date, 1)}`}>Next →</Link>
      </div>

      {rows.length === 0 ? (
        <Empty>No visits on this day.</Empty>
      ) : (
        [...groups.entries()].map(([areaName, list]) => (
          <section key={areaName} className="card mb-4">
            <h3 className="font-semibold text-gray-900">{areaName} <span className="font-normal text-gray-500">· {list.length}</span></h3>
            <ul className="mt-2 divide-y divide-gray-100">
              {list.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/customers/${v.customers?.id}`} className="font-medium text-gray-900 hover:underline">{v.customers?.full_name}</Link>
                    <p className="text-sm text-gray-600">{v.customers?.address}</p>
                    {v.original_date !== v.visit_date && <p className="text-xs text-amber-700">Moved from {formatDay(v.original_date)}</p>}
                  </div>
                  <form action={setVisitStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={v.id} />
                    {v.status === "scheduled" ? (
                      <>
                        <button name="status" value="completed" className="btn py-1.5">Mark done</button>
                        <button name="status" value="skipped" className="btn-outline py-1.5">Skip</button>
                      </>
                    ) : (
                      <>
                        <span className={`badge ${v.status === "skipped" ? "!bg-gray-100 !text-gray-600" : ""}`}>{v.status === "completed" ? "Done" : "Skipped"}</span>
                        <button name="status" value="scheduled" className="text-sm text-gray-600 underline">Undo</button>
                      </>
                    )}
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <h2 className="mb-2 mt-8 text-lg font-semibold text-gray-900">Extra services to do</h2>
      {((orders ?? []) as unknown as OrderRow[]).length === 0 ? (
        <Empty>No paid extra services waiting.</Empty>
      ) : (
        <ul className="card divide-y divide-gray-100">
          {((orders ?? []) as unknown as OrderRow[]).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-gray-900">{o.name} <span className="font-normal text-gray-500">· {formatMoney(o.price_cents)}</span></p>
                <p className="text-sm text-gray-600">
                  <Link href={`/dashboard/customers/${o.customers?.id}`} className="hover:underline">{o.customers?.full_name}</Link> — {o.customers?.address}
                </p>
              </div>
              <form action={setOrderStatus}>
                <input type="hidden" name="id" value={o.id} />
                <button name="status" value="completed" className="btn py-1.5">Mark done</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
