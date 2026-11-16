import { Hono } from "hono";
import type { Env } from "../env";
import { lookupZip } from "../data/geo";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson } from "../lib/http";
export const explore = new Hono<{ Bindings: Env }>();
// Fixed public Census host; validated ZIP values cannot inject a query or proxy arbitrary URLs.
explore.get("/boundary/:zip", async (c) => {
  const zip = c.req.param("zip");
  if (!/^\d{5}$/.test(zip)) return c.json({ error: "Invalid ZIP" }, 400);
  try {
    const { value } = await cached(
      c.env.DB,
      `zcta:2020:v1:${zip}`,
      30 * DAY_SECONDS,
      async () => {
        const q = new URLSearchParams({
          where: `ZCTA5='${zip}'`,
          outFields: "ZCTA5",
          returnGeometry: "true",
          outSR: "4326",
          maxAllowableOffset: "0.0002",
          f: "geojson",
        });
        const data = await fetchJson<{ type: string; features?: unknown[] }>(
          `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2025/MapServer/2/query?${q}`,
          { service: "Census ZCTA", timeoutMs: 8000 },
        );
        if (data.type !== "FeatureCollection" || !data.features?.length)
          throw new Error("No ZCTA boundary");
        return data;
      },
    );
    c.header("Cache-Control", "public, max-age=86400");
    return c.json(value);
  } catch {
    return c.json({ error: "Boundary unavailable; use location marker." }, 503);
  }
});
explore.get("/zip/:zip", async (c) => {
  const zip = c.req.param("zip");
  if (!/^\d{5}$/.test(zip))
    return c.json({ error: "Enter a five-digit US ZIP code." }, 400);
  const place = await lookupZip(c.env.DB, zip);
  if (!place)
    return c.json({ error: "ZIP lookup unavailable or ZIP not found." }, 404);
  c.header("Cache-Control", "public, max-age=86400");
  return c.json(place);
});
