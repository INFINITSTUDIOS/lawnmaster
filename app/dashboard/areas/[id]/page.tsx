import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { PageHeader, formatDay } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireCompany } from "@/lib/auth";
import { polygonCenter } from "@/lib/geo";
import { today } from "@/lib/schedule";
import { FREQUENCIES, FREQUENCY_LABEL, type LawnTier, type MowingPrice, type ServiceArea } from "@/lib/types";
import { addBlackout, deleteArea, removeBlackout, savePrices } from "../../actions";
import { AreaForm } from "../AreaForm";

export default async function AreaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const { id } = await params;
  const { company, supabase } = await requireCompany();
  const msg = await readNotice(searchParams);
  const [{ data: all }, { data: tiers }, { data: prices }, { data: blackouts }] = await Promise.all([
    supabase.from("service_areas").select("*").eq("company_id", company.id),
    supabase.from("lawn_size_tiers").select("*").eq("company_id", company.id).order("min_sqft"),
    supabase.from("mowing_prices").select("*").eq("area_id", id),
    supabase.from("area_blackout_dates").select("date").eq("area_id", id).gte("date", today()).order("date"),
  ]);
  const area = ((all ?? []) as ServiceArea[]).find((a) => a.id === id);
  if (!area) notFound();
  const others = ((all ?? []) as ServiceArea[]).filter((a) => a.id !== id).map((a) => ({ name: a.name, boundary: a.boundary }));
  const priceMap = new Map(((prices ?? []) as MowingPrice[]).map((p) => [`${p.tier_id}:${p.frequency}`, p.price_cents]));

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/dashboard/areas" className="text-brand hover:underline">← Service areas</Link></p>
      <PageHeader title={area.name} />
      <Notice {...msg} />
      <AreaForm area={area} others={others} center={polygonCenter(area.boundary)} />

      <section className="card mt-6" id="prices">
        <h2 className="text-lg font-semibold text-gray-900">Mowing prices in {area.name}</h2>
        <p className="text-sm text-gray-600">
          Price per visit, charged each time the plan renews. Leave a box empty to not offer that option.{" "}
          <Link href="/dashboard/pricing" className="text-brand hover:underline">Edit lawn sizes</Link>
        </p>
        <form action={savePrices} className="mt-4">
          <input type="hidden" name="area_id" value={area.id} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="pb-2 pr-3 font-medium">Lawn size</th>
                  {FREQUENCIES.map((f) => <th key={f} className="pb-2 pr-3 font-medium">{FREQUENCY_LABEL[f]}</th>)}
                </tr>
              </thead>
              <tbody>
                {((tiers ?? []) as LawnTier[]).map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-gray-900">
                      {t.name}
                      <span className="block text-xs font-normal text-gray-500">
                        {t.max_sqft === null ? `${t.min_sqft.toLocaleString()}+ sq ft` : `${t.min_sqft.toLocaleString()}–${t.max_sqft.toLocaleString()} sq ft`}
                      </span>
                    </th>
                    {FREQUENCIES.map((f) => {
                      const cents = priceMap.get(`${t.id}:${f}`);
                      return (
                        <td key={f} className="py-2 pr-3">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">$</span>
                            <input
                              className="input w-24"
                              name={`price:${t.id}:${f}`}
                              inputMode="decimal"
                              aria-label={`${t.name}, ${FREQUENCY_LABEL[f]}`}
                              defaultValue={cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0) : ""}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4"><SubmitButton pendingText="Saving…">Save prices</SubmitButton></div>
        </form>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold text-gray-900">Days off</h2>
        <p className="text-sm text-gray-600">Holidays or days you can&apos;t work here. Visits on these dates move to your next service day.</p>
        <form action={addBlackout} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="area_id" value={area.id} />
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input className="input" id="date" name="date" type="date" required min={today()} />
          </div>
          <SubmitButton className="btn-outline">Add day off</SubmitButton>
        </form>
        {(blackouts ?? []).length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {(blackouts ?? []).map((b) => (
              <li key={b.date}>
                <form action={removeBlackout} className="flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-sm">
                  <input type="hidden" name="area_id" value={area.id} />
                  <input type="hidden" name="date" value={b.date} />
                  {formatDay(b.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  <button className="rounded-full px-2 text-gray-500 hover:bg-gray-200 hover:text-gray-900" aria-label={`Remove ${b.date}`}>×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={deleteArea} className="mt-6">
        <input type="hidden" name="id" value={area.id} />
        <button className="btn-danger">Delete this area</button>
      </form>
    </>
  );
}
