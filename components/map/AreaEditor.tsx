"use client";

import { useState } from "react";
import type { Polygon } from "geojson";
import { AddressSearch } from "./AddressSearch";
import { DrawMap } from "./DrawMap";

/** Map for drawing a service area. Writes the polygon into a hidden form field. */
export function AreaEditor({
  token,
  initial,
  others,
  center,
}: {
  token: string | null;
  initial: Polygon | null;
  others: { name: string; boundary: Polygon }[];
  center: [number, number] | null;
}) {
  const [boundary, setBoundary] = useState<Polygon | null>(initial);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  if (!token) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        The map needs a Mapbox token. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> and reload.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="city-search">Find your city or neighborhood</label>
        <AddressSearch id="city-search" token={token} kind="place" proximity={center} placeholder="e.g. Austin, TX" onSelect={(p) => setFlyTo([p.lng, p.lat])} />
      </div>
      <DrawMap
        token={token}
        mapStyle="streets"
        center={center ?? [-98.5, 39.5]}
        zoom={center ? 11 : 3}
        initial={initial}
        context={others}
        flyTo={flyTo}
        onChange={setBoundary}
        className="h-[28rem]"
      />
      <p className="text-sm text-gray-600">
        {boundary
          ? "Drag the corners to adjust. Use the polygon tool to redraw, or the bin to delete."
          : "Click the polygon tool, then click around the edge of the area. Double-click to finish."}
      </p>
      <input type="hidden" name="boundary" value={boundary ? JSON.stringify(boundary) : ""} />
    </div>
  );
}
