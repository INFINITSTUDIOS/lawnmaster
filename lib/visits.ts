import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, plannedVisits, today, VISIT_HORIZON_DAYS, type Availability } from "./schedule";
import type { ServiceArea, Subscription } from "./types";

export async function loadBlackouts(db: SupabaseClient, areaId: string): Promise<Set<string>> {
  const { data } = await db.from("area_blackout_dates").select("date").eq("area_id", areaId);
  return new Set((data ?? []).map((r) => r.date as string));
}

/** What a new customer in this area can book between two dates. */
export async function loadAvailability(
  db: SupabaseClient,
  area: Pick<ServiceArea, "id" | "service_weekdays" | "daily_capacity">,
  from: string,
  to: string,
): Promise<Availability> {
  const blackouts = await loadBlackouts(db, area.id);
  const booked = new Map<string, number>();
  if (area.daily_capacity !== null) {
    const { data } = await db
      .from("visits")
      .select("visit_date")
      .eq("area_id", area.id)
      .eq("status", "scheduled")
      .gte("visit_date", from)
      .lte("visit_date", to);
    for (const r of data ?? []) booked.set(r.visit_date, (booked.get(r.visit_date) ?? 0) + 1);
  }
  return { weekdays: area.service_weekdays, blackouts, booked, capacity: area.daily_capacity };
}

/**
 * Make sure visits exist for a subscription up to the horizon. Safe to call
 * repeatedly: each schedule slot is only ever inserted once.
 */
export async function generateVisits(db: SupabaseClient, sub: Subscription): Promise<number> {
  if (sub.status !== "active") return 0;
  const { data: area } = await db.from("service_areas").select("id, service_weekdays").eq("id", sub.area_id).single();
  if (!area) return 0;
  const blackouts = await loadBlackouts(db, sub.area_id);
  const now = today();
  const from = sub.start_date > now ? sub.start_date : now;
  const rows = plannedVisits(sub.start_date, sub.frequency, from, addDays(now, VISIT_HORIZON_DAYS), area.service_weekdays, blackouts).map(
    (v) => ({
      company_id: sub.company_id,
      subscription_id: sub.id,
      customer_id: sub.customer_id,
      area_id: sub.area_id,
      original_date: v.original,
      visit_date: v.date,
    }),
  );
  if (rows.length === 0) return 0;
  const { error } = await db.from("visits").upsert(rows, { onConflict: "subscription_id,original_date", ignoreDuplicates: true });
  if (error) throw new Error(`Could not generate visits: ${error.message}`);
  return rows.length;
}

/** Drop not-yet-done visits from today on (used when a subscription ends). */
export async function removeUpcomingVisits(db: SupabaseClient, subscriptionId: string): Promise<void> {
  await db.from("visits").delete().eq("subscription_id", subscriptionId).eq("status", "scheduled").gte("visit_date", today());
}
