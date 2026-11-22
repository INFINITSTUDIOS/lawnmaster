"use client";

import { useEffect, useRef, useState } from "react";

export type Place = { label: string; lng: number; lat: number };

type GeocodeFeature = {
  geometry: { coordinates: [number, number] };
  properties: { full_address?: string; name?: string; place_formatted?: string };
};

/** Autocomplete box backed by the Mapbox Geocoding API. */
export function AddressSearch({
  token,
  kind,
  proximity,
  placeholder,
  onSelect,
  id,
}: {
  token: string;
  /** "address" for street addresses, "place" for cities/neighbourhoods. */
  kind: "address" | "place";
  proximity?: [number, number] | null;
  placeholder?: string;
  onSelect: (place: Place) => void;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = useRef<string | null>(null);
  const prox = proximity ? proximity.join(",") : "";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === picked.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          access_token: token,
          autocomplete: "true",
          limit: "5",
          types: kind === "address" ? "address" : "place,locality,neighborhood,postcode",
        });
        if (prox) params.set("proximity", prox);
        const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { features: GeocodeFeature[] };
        setResults(
          json.features.map((f) => ({
            label: f.properties.full_address ?? [f.properties.name, f.properties.place_formatted].filter(Boolean).join(", "),
            lng: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          })),
        );
        setError(null);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Address search is unavailable right now.");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, token, kind, prox]);

  return (
    <div className="relative">
      <input
        id={id}
        className="input"
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          picked.current = null;
          setQuery(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? "address"}-results`}
      />
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      {open && query.trim().length >= 3 && (
        <ul id={`${id ?? "address"}-results`} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No matches found.</li>}
          {results.map((r) => (
            <li key={`${r.label}${r.lng}${r.lat}`} role="option" aria-selected="false">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-soft"
                onClick={() => {
                  picked.current = r.label;
                  setQuery(r.label);
                  setOpen(false);
                  onSelect(r);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
