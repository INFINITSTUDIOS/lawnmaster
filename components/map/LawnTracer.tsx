"use client";

import type { Polygon } from "geojson";
import { DrawMap } from "./DrawMap";

/** Satellite view of the customer's property where they trace their lawn. */
export function LawnTracer({
  token,
  lng,
  lat,
  initial,
  onChange,
}: {
  token: string;
  lng: number;
  lat: number;
  initial: Polygon | null;
  onChange: (outline: Polygon | null) => void;
}) {
  return (
    <DrawMap
      token={token}
      mapStyle="satellite"
      center={[lng, lat]}
      zoom={19}
      marker={[lng, lat]}
      initial={initial}
      onChange={onChange}
      className="h-[26rem]"
    />
  );
}
