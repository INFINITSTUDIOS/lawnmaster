import area from "@turf/area";
import type { Polygon } from "geojson";
import { z } from "zod";
import { sqmToSqft } from "./pricing";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** A simple GeoJSON polygon: one closed outer ring, no holes. */
export const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(position).min(4).max(500))
    .length(1)
    .refine((rings) => {
      const ring = rings[0];
      const a = ring[0];
      const b = ring[ring.length - 1];
      return a[0] === b[0] && a[1] === b[1];
    }, "ring must be closed"),
});

export function parsePolygon(input: unknown): Polygon | null {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  const parsed = polygonSchema.safeParse(value);
  return parsed.success ? (parsed.data as Polygon) : null;
}

export function polygonSqft(polygon: Polygon): number {
  return sqmToSqft(area({ type: "Feature", properties: {}, geometry: polygon }));
}

export function polygonCenter(polygon: Polygon): [number, number] {
  const ring = polygon.coordinates[0].slice(0, -1);
  const sum = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}
