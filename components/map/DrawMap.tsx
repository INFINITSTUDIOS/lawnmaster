"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { useEffect, useRef, useState } from "react";
import type { Feature, Polygon } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";

export type DrawMapProps = {
  token: string;
  mapStyle: "streets" | "satellite";
  center: [number, number];
  zoom: number;
  /** Polygon to start with (editable). */
  initial?: Polygon | null;
  /** Other shapes shown for reference, not editable. */
  context?: { name: string; boundary: Polygon }[];
  /** Drop a pin here (e.g. the customer's address). */
  marker?: [number, number];
  /** When this changes the map flies there. */
  flyTo?: [number, number] | null;
  onChange: (polygon: Polygon | null) => void;
  className?: string;
};

const STYLES = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

function bounds(polygons: Polygon[]): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygons) {
    for (const [x, y] of p.coordinates[0] ?? []) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}

/** A Mapbox map where the user draws and edits a single polygon. */
export function DrawMap(props: DrawMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const onChange = useRef(props.onChange);
  const [failed, setFailed] = useState<string | null>(null);
  // Only the first render's values configure the map.
  const init = useRef(props);

  useEffect(() => {
    onChange.current = props.onChange;
  });

  useEffect(() => {
    let cancelled = false;
    let map: MapboxMap | undefined;
    (async () => {
      try {
        const [{ default: mapboxgl }, { default: MapboxDraw }] = await Promise.all([
          import("mapbox-gl"),
          import("@mapbox/mapbox-gl-draw"),
        ]);
        if (cancelled || !container.current) return;
        const p = init.current;
        mapboxgl.accessToken = p.token;
        map = new mapboxgl.Map({
          container: container.current,
          style: STYLES[p.mapStyle],
          center: p.center,
          zoom: p.zoom,
        });
        mapRef.current = map;
        map.on("error", (e) => {
          if ((e.error as { status?: number } | undefined)?.status === 401) setFailed("The map could not load: the Mapbox token was rejected.");
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: { polygon: true, trash: true },
          defaultMode: p.initial ? "simple_select" : "draw_polygon",
        });
        map.addControl(draw, "top-left");
        if (p.marker) new mapboxgl.Marker({ color: "#15803d" }).setLngLat(p.marker).addTo(map);

        const emit = () => {
          const features = draw.getAll().features.filter((f) => f.geometry.type === "Polygon") as Feature<Polygon>[];
          onChange.current(features.length ? features[features.length - 1].geometry : null);
        };
        map.on("draw.create", (e: { features: Feature[] }) => {
          // Keep a single shape: drawing a new one replaces the old.
          const keep = e.features[0]?.id;
          for (const f of draw.getAll().features) if (f.id !== keep && f.id != null) draw.delete(String(f.id));
          emit();
        });
        map.on("draw.update", emit);
        map.on("draw.delete", emit);

        map.on("load", () => {
          if (!map) return;
          if (p.context?.length) {
            map.addSource("context", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: p.context.map((c) => ({ type: "Feature", properties: { name: c.name }, geometry: c.boundary })),
              },
            });
            map.addLayer({ id: "context-fill", type: "fill", source: "context", paint: { "fill-color": "#6b7280", "fill-opacity": 0.15 } });
            map.addLayer({ id: "context-line", type: "line", source: "context", paint: { "line-color": "#4b5563", "line-width": 1.5, "line-dasharray": [2, 2] } });
            map.addLayer({ id: "context-label", type: "symbol", source: "context", layout: { "text-field": ["get", "name"], "text-size": 12 }, paint: { "text-color": "#374151", "text-halo-color": "#fff", "text-halo-width": 1 } });
          }
          if (p.initial) {
            draw.add({ type: "Feature", properties: {}, geometry: p.initial });
            const b = bounds([p.initial]);
            if (b) map.fitBounds(b, { padding: 50, duration: 0 });
          }
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed("The map could not load in this browser.");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  const flyLng = props.flyTo?.[0];
  const flyLat = props.flyTo?.[1];
  useEffect(() => {
    if (flyLng !== undefined && flyLat !== undefined) mapRef.current?.flyTo({ center: [flyLng, flyLat], zoom: 12 });
  }, [flyLng, flyLat]);

  return (
    <div className={props.className ?? "h-96"}>
      {failed ? (
        <div role="alert" className="flex h-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">{failed}</div>
      ) : (
        <div ref={container} className="h-full w-full overflow-hidden rounded-xl border border-gray-200" />
      )}
    </div>
  );
}
