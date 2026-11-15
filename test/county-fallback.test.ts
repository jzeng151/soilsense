import { afterEach, describe, expect, it, vi } from "vitest";
import { getCounty } from "../src/worker/data/geo";

const census = {
  result: { geographies: { Counties: [{ GEOID: "20055", NAME: "Finney County", STATE: "20" }] } },
};

afterEach(() => vi.unstubAllGlobals());

describe("county lookup", () => {
  it("falls back to the Census geocoder when FCC is down", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      String(url).includes("geo.fcc.gov") ? new Response("down", { status: 503 }) : new Response(JSON.stringify(census), { status: 200 }),
    );
    const c = await getCounty(undefined, 37.9, -100.8);
    expect(c).toEqual({ countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" });
  });

  it("returns null (and does not throw) when both are down", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    expect(await getCounty(undefined, 37.8, -100.7)).toBeNull();
  });
});
