import { describe, expect, it } from "vitest";
import { parsePolygon, polygonCenter, polygonSqft } from "@/lib/geo";

// Roughly a 30m x 30m square near Austin, TX.
const square = {
  type: "Polygon" as const,
  coordinates: [[[-97.75, 30.27], [-97.749688, 30.27], [-97.749688, 30.27027], [-97.75, 30.27027], [-97.75, 30.27]]],
};

describe("geo", () => {
  it("measures a lawn in square feet", () => {
    const sqft = polygonSqft(square);
    // ~30m x ~30m = ~900 m² = ~9,700 sq ft
    expect(sqft).toBeGreaterThan(9000);
    expect(sqft).toBeLessThan(10500);
  });
  it("accepts JSON strings and rejects malformed polygons", () => {
    expect(parsePolygon(JSON.stringify(square))).not.toBeNull();
    expect(parsePolygon("nope")).toBeNull();
    expect(parsePolygon({ type: "Polygon", coordinates: [[[0, 0], [1, 1], [0, 0]]] })).toBeNull();
    expect(parsePolygon({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toBeNull(); // not closed
    expect(parsePolygon({ type: "Polygon", coordinates: [[[0, 0], [999, 0], [1, 1], [0, 0]]] })).toBeNull(); // out of range
    expect(parsePolygon({ type: "Point", coordinates: [0, 0] })).toBeNull();
  });
  it("finds the centre", () => {
    const [lng, lat] = polygonCenter(square);
    expect(lng).toBeCloseTo(-97.749844, 5);
    expect(lat).toBeCloseTo(30.270135, 5);
  });
});
