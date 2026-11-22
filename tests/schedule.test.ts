import { describe, expect, it } from "vitest";
import {
  availableDates,
  nthWeekdayOfMonth,
  occurrenceDates,
  plannedVisits,
  rollToServiceDay,
  weekday,
} from "@/lib/schedule";

describe("occurrenceDates", () => {
  it("weekly repeats every 7 days from the start", () => {
    expect(occurrenceDates("2026-06-02", "weekly", "2026-06-01", "2026-06-23")).toEqual([
      "2026-06-02", "2026-06-09", "2026-06-16", "2026-06-23",
    ]);
  });
  it("biweekly and triweekly step 14 and 21 days", () => {
    expect(occurrenceDates("2026-06-02", "biweekly", "2026-06-02", "2026-07-01")).toEqual([
      "2026-06-02", "2026-06-16", "2026-06-30",
    ]);
    expect(occurrenceDates("2026-06-02", "triweekly", "2026-06-02", "2026-07-15")).toEqual([
      "2026-06-02", "2026-06-23", "2026-07-14",
    ]);
  });
  it("stays in phase when the window starts later", () => {
    expect(occurrenceDates("2026-06-02", "biweekly", "2026-06-17", "2026-07-20")).toEqual([
      "2026-06-30", "2026-07-14",
    ]);
    expect(occurrenceDates("2026-06-02", "biweekly", "2026-06-16", "2026-06-16")).toEqual(["2026-06-16"]);
  });
  it("returns nothing before the start date", () => {
    expect(occurrenceDates("2026-06-02", "weekly", "2026-05-01", "2026-06-01")).toEqual([]);
  });
  it("monthly keeps the nth weekday (2nd Tuesday)", () => {
    // 2026-06-09 is the 2nd Tuesday of June 2026.
    const dates = occurrenceDates("2026-06-09", "monthly", "2026-06-01", "2026-09-30");
    expect(dates).toEqual(["2026-06-09", "2026-07-14", "2026-08-11", "2026-09-08"]);
    for (const d of dates) expect(weekday(d)).toBe(2);
  });
  it("monthly on a 5th weekday falls back to the last one, across a year end", () => {
    // 2026-12-29 is the 5th Tuesday of December 2026.
    expect(occurrenceDates("2026-12-29", "monthly", "2026-12-01", "2027-03-31")).toEqual([
      "2026-12-29", "2027-01-26", "2027-02-23", "2027-03-30",
    ]);
  });
});

describe("nthWeekdayOfMonth", () => {
  it("finds the first Monday", () => {
    expect(nthWeekdayOfMonth(2026, 5, 1, 1)).toBe("2026-06-01");
  });
});

describe("rollToServiceDay", () => {
  it("keeps a valid day", () => {
    expect(rollToServiceDay("2026-06-02", [2, 4], new Set())).toBe("2026-06-02");
  });
  it("moves a blacked-out day to the next service day", () => {
    expect(rollToServiceDay("2026-06-02", [2, 4], new Set(["2026-06-02"]))).toBe("2026-06-04");
  });
  it("moves when the weekday is no longer serviced", () => {
    expect(rollToServiceDay("2026-06-02", [5], new Set())).toBe("2026-06-05");
  });
  it("returns null with no service weekdays", () => {
    expect(rollToServiceDay("2026-06-02", [], new Set())).toBeNull();
  });
});

describe("availableDates", () => {
  it("applies weekdays, blackouts and capacity", () => {
    const dates = availableDates(
      {
        weekdays: [2, 4],
        blackouts: new Set(["2026-06-04"]),
        booked: new Map([["2026-06-09", 3], ["2026-06-11", 2]]),
        capacity: 3,
      },
      "2026-06-01",
      "2026-06-12",
    );
    expect(dates).toEqual(["2026-06-02", "2026-06-11"]);
  });
  it("ignores bookings when capacity is unlimited", () => {
    expect(
      availableDates({ weekdays: [2], blackouts: new Set(), booked: new Map([["2026-06-02", 99]]), capacity: null }, "2026-06-01", "2026-06-07"),
    ).toEqual(["2026-06-02"]);
  });
});

describe("plannedVisits", () => {
  it("keeps the original slot and the rolled date", () => {
    expect(plannedVisits("2026-06-02", "weekly", "2026-06-02", "2026-06-10", [2, 4], new Set(["2026-06-09"]))).toEqual([
      { original: "2026-06-02", date: "2026-06-02" },
      { original: "2026-06-09", date: "2026-06-11" },
    ]);
  });
});
