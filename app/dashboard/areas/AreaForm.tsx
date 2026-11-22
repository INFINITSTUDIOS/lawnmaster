import type { Polygon } from "geojson";
import { AreaEditor } from "@/components/map/AreaEditor";
import { SubmitButton } from "@/components/SubmitButton";
import { WEEKDAY_NAMES, type ServiceArea } from "@/lib/types";
import { saveArea } from "../actions";

export function AreaForm({
  area,
  others,
  center,
}: {
  area: ServiceArea | null;
  others: { name: string; boundary: Polygon }[];
  center: [number, number] | null;
}) {
  return (
    <form action={saveArea} className="card space-y-5">
      {area && <input type="hidden" name="id" value={area.id} />}
      <div>
        <label className="label" htmlFor="name">Area name</label>
        <input className="input max-w-sm" id="name" name="name" required maxLength={80} defaultValue={area?.name} placeholder="e.g. Northside" />
      </div>
      <AreaEditor token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null} initial={area?.boundary ?? null} others={others} center={center} />
      <fieldset>
        <legend className="label">Days you service this area</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_NAMES.map((day, i) => (
            <label key={day} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="checkbox" name="weekday" value={i} defaultChecked={area?.service_weekdays.includes(i)} className="accent-[var(--brand)]" />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="daily_capacity">Most lawns you can mow here in a day</label>
        <input className="input max-w-[10rem]" id="daily_capacity" name="daily_capacity" type="number" min={1} step={1} defaultValue={area?.daily_capacity ?? ""} placeholder="No limit" />
        <p className="mt-1 text-xs text-gray-500">Full days are hidden from new customers. Leave blank for no limit.</p>
      </div>
      {area && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={area.active} className="accent-[var(--brand)]" />
          Accepting new customers in this area
        </label>
      )}
      <SubmitButton pendingText="Saving…">{area ? "Save area" : "Create area"}</SubmitButton>
    </form>
  );
}
