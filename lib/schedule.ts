import type { Frequency } from "./types";

/** All dates here are calendar dates as "YYYY-MM-DD" strings, handled in UTC. */

const DAY_MS = 86_400_000;

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return formatDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

export function weekday(iso: string): number {
  return parseDate(iso).getUTCDay();
}

export function isValidDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && formatDate(parseDate(iso)) === iso;
}

const WEEKS: Record<Exclude<Frequency, "monthly">, number> = { weekly: 1, biweekly: 2, triweekly: 3 };

/**
 * The date of the nth `dow` weekday in a month. If the month has no nth one
 * (e.g. a 5th Tuesday), the last one is used.
 */
export function nthWeekdayOfMonth(year: number, month: number, dow: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (dow - first.getUTCDay() + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let day = 1 + offset + (n - 1) * 7;
  while (day > daysInMonth) day -= 7;
  return formatDate(new Date(Date.UTC(year, month, day)));
}

/**
 * Planned visit dates for a subscription between `from` and `to` (inclusive),
 * before blackout/roll-over adjustment. The start date is always the first one.
 * Weekly/2/3-week plans repeat every 7/14/21 days; monthly plans keep the same
 * "nth weekday of the month" as the start date (e.g. every 2nd Tuesday).
 */
export function occurrenceDates(start: string, frequency: Frequency, from: string, to: string): string[] {
  const out: string[] = [];
  if (to < start) return out;
  if (frequency !== "monthly") {
    const step = WEEKS[frequency] * 7;
    let n = from > start ? Math.ceil((parseDate(from).getTime() - parseDate(start).getTime()) / DAY_MS / step) : 0;
    for (let d = addDays(start, n * step); d <= to; d = addDays(start, ++n * step)) out.push(d);
    return out;
  }
  const s = parseDate(start);
  const dow = s.getUTCDay();
  const nth = Math.ceil(s.getUTCDate() / 7);
  for (let i = 0; ; i++) {
    const d = i === 0 ? start : nthWeekdayOfMonth(s.getUTCFullYear(), s.getUTCMonth() + i, dow, nth);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/**
 * If `date` can't be serviced (not a service weekday, or blacked out), move it
 * to the next date that can. Returns null if nothing is found within 60 days.
 */
export function rollToServiceDay(date: string, weekdays: number[], blackouts: ReadonlySet<string>): string | null {
  if (weekdays.length === 0) return null;
  for (let i = 0; i <= 60; i++) {
    const d = addDays(date, i);
    if (weekdays.includes(weekday(d)) && !blackouts.has(d)) return d;
  }
  return null;
}

export type Availability = {
  weekdays: number[];
  blackouts: ReadonlySet<string>;
  /** Scheduled visits already booked per date. */
  booked: ReadonlyMap<string, number>;
  /** Max visits per day; null = unlimited. */
  capacity: number | null;
};

/** Dates a new customer may pick for their first visit. */
export function availableDates(a: Availability, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!a.weekdays.includes(weekday(d))) continue;
    if (a.blackouts.has(d)) continue;
    if (a.capacity !== null && (a.booked.get(d) ?? 0) >= a.capacity) continue;
    out.push(d);
  }
  return out;
}

/** How far ahead customers can book their first visit, and how soon. */
export const BOOKING_LEAD_DAYS = 2;
export const BOOKING_WINDOW_DAYS = 42;
/** How far ahead visits are generated for active subscriptions. */
export const VISIT_HORIZON_DAYS = 56;

export function today(): string {
  return formatDate(new Date());
}

/** Planned visits with roll-over applied: [{ original, date }] */
export function plannedVisits(
  start: string,
  frequency: Frequency,
  from: string,
  to: string,
  weekdays: number[],
  blackouts: ReadonlySet<string>,
): { original: string; date: string }[] {
  const out: { original: string; date: string }[] = [];
  for (const original of occurrenceDates(start, frequency, from, to)) {
    const date = rollToServiceDay(original, weekdays, blackouts);
    if (date) out.push({ original, date });
  }
  return out;
}
