"use client";

import { useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Month calendar where only the given dates can be picked. Dates are "YYYY-MM-DD". */
export function DatePicker({ available, value, onChange }: { available: string[]; value: string | null; onChange: (date: string) => void }) {
  const months = [...new Set(available.map((d) => d.slice(0, 7)))].sort();
  const [month, setMonth] = useState(value?.slice(0, 7) ?? months[0]);
  if (months.length === 0) return <p className="text-sm text-gray-600">No dates are open right now.</p>;
  const idx = Math.max(0, months.indexOf(month));
  const [y, m] = months[idx].split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const open = new Set(available);
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="btn-outline px-3 py-1.5" disabled={idx === 0} onClick={() => setMonth(months[idx - 1])} aria-label="Previous month">←</button>
        <p className="font-semibold text-gray-900" aria-live="polite">{MONTHS[m - 1]} {y}</p>
        <button type="button" className="btn-outline px-3 py-1.5" disabled={idx === months.length - 1} onClick={() => setMonth(months[idx + 1])} aria-label="Next month">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} />;
          const iso = `${y}-${pad(m)}-${pad(day)}`;
          const can = open.has(iso);
          const selected = value === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={!can}
              aria-pressed={selected}
              aria-label={`${MONTHS[m - 1]} ${day}${can ? "" : ", unavailable"}`}
              onClick={() => onChange(iso)}
              className={`aspect-square rounded-lg text-sm font-medium ${
                selected ? "bg-brand text-white" : can ? "border border-brand-line bg-brand-soft text-brand-dark hover:border-brand" : "text-gray-300"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
