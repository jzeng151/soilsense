import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { MemoryRunStore } from "../src/worker/fieldwatch/agentCore";
import { historyToDayMap } from "../src/worker/fieldwatch/sources";
import { isoDate, type DayMap } from "../src/worker/fieldwatch/rule";
import type { FieldWatchDeps, WatchedField } from "../src/worker/fieldwatch/run";
import { applySettings, DEFAULT_SETTINGS, FRESH_DAYS, nextWeeklyAt, nextWindowOpening, runRecurringCheck, SettingsError, windowIsOpen, type WatchSettings } from "../src/worker/fieldwatch/watchCore";

const finney: WatchedField = { id: "finney-ks", name: "Finney County, KS", lat: 38.1095, lon: -100.706, fips: "20055", state: "KS" };
const history = historyToDayMap(parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse));

/** Recent days ending `lagDays` before `now`, with `rain` mm/day. */
function recentDays(now: Date, lagDays: number, rain = 2): DayMap {
  const m: DayMap = new Map();
  for (let i = 60; i >= 1; i--) {
    const d = isoDate(new Date(now.getTime() - i * 86_400_000));
    m.set(d, i >= lagDays ? { prcp: rain, tmax: 30, tmin: 15, gwetroot: 0.5 } : { prcp: null, tmax: null, tmin: null, gwetroot: null });
  }
  return m;
}
function deps(recent: DayMap): FieldWatchDeps {
  return { recent: async () => recent, history: async () => history, kansas: async () => null };
}
const on = (crop: WatchSettings["crop"] = null): WatchSettings => ({ ...DEFAULT_SETTINGS, enabled: true, crop, version: 3 });

describe("recurring watch settings", () => {
  it("is off by default and validates changes, bumping the version each time", () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
    const a = applySettings(DEFAULT_SETTINGS, { enabled: true }, 1);
    expect(a).toMatchObject({ enabled: true, crop: null, version: 1 });
    const b = applySettings(a, { crop: "corn" }, 2);
    expect(b).toMatchObject({ enabled: true, crop: "corn", version: 2 });
    expect(() => applySettings(b, { crop: "fallow" }, 3)).toThrow(SettingsError);
    expect(() => applySettings(b, { enabled: "yes" }, 3)).toThrow(SettingsError);
  });

  it("schedules weekly checks for the next Monday at 14:00 UTC, whatever the server's time zone", () => {
    expect(new Date(nextWeeklyAt(Date.parse("2026-11-15T05:00:00Z"))).toISOString()).toBe("2026-11-16T14:00:00.000Z"); // Sunday night
    expect(new Date(nextWeeklyAt(Date.parse("2026-11-16T13:59:00Z"))).toISOString()).toBe("2026-11-16T14:00:00.000Z"); // Monday morning
    expect(new Date(nextWeeklyAt(Date.parse("2026-11-16T14:00:00Z"))).toISOString()).toBe("2026-11-23T14:00:00.000Z"); // exactly at the time
  });

  it("plans the next opening of the crop's reference window, next year once it has passed", () => {
    expect(nextWindowOpening("corn", Date.parse("2026-11-15T00:00:00Z"))).toMatchObject({ seasonYear: 2027, from: "2027-06-01", to: "2027-08-31", at: Date.parse("2027-06-01T14:00:00Z") });
    expect(nextWindowOpening("corn", Date.parse("2026-05-01T00:00:00Z"))).toMatchObject({ seasonYear: 2026, from: "2026-06-01" });
    expect(nextWindowOpening("corn", Date.parse("2026-11-15T00:00:00Z")).source).toMatch(/not an observed crop stage/);
    expect(windowIsOpen("corn", "2026-07-04")).toBe(true);
    expect(windowIsOpen("corn", "2026-11-15")).toBe(false);
  });
});

describe("weekly and window checks", () => {
  const july = new Date("2025-07-14T14:00:00Z");

  it("does nothing when disabled or when the settings changed after scheduling", async () => {
    const store = new MemoryRunStore();
    expect(await runRecurringCheck("weekly", { version: 3 }, { ...on(), enabled: false }, store, {}, finney, july, deps(recentDays(july, 4)))).toBeNull();
    expect(await runRecurringCheck("weekly", { version: 2 }, on(), store, {}, finney, july, deps(recentDays(july, 4)))).toBeNull();
    expect(store.list(10)).toHaveLength(0);
  });

  it("records one weekly result per data period, even if the callback repeats", async () => {
    const store = new MemoryRunStore();
    const d = deps(recentDays(july, 4));
    const a = await runRecurringCheck("weekly", { version: 3 }, on(), store, {}, finney, july, d);
    const b = await runRecurringCheck("weekly", { version: 3 }, on(), store, {}, finney, new Date(july.getTime() + 3600_000), d);
    expect(a!.runId).toBe("finney-ks:weekly:2025-07-10");
    expect(a!.snapshot!.label).toBe("Current conditions");
    expect(b!.runId).toBe(a!.runId);
    expect(store.list(10)).toHaveLength(1);
  });

  it("refuses stale data: Insufficient, with the freshness rule as the reason", async () => {
    const store = new MemoryRunStore();
    const run = await runRecurringCheck("weekly", { version: 3 }, on(), store, {}, finney, july, deps(recentDays(july, FRESH_DAYS + 3)));
    expect(run!.status).toBe("insufficient");
    expect(run!.reasons.some((r) => r.id === "stale")).toBe(true);
  });

  it("reports an inactive crop window instead of forcing a stress result", async () => {
    const store = new MemoryRunStore();
    const nov = new Date("2025-11-17T14:00:00Z");
    const run = await runRecurringCheck("weekly", { version: 3 }, on("corn"), store, {}, finney, nov, deps(recentDays(nov, 4)));
    expect(run!.status).toBe("inactive");
    expect(run!.metrics).toBeNull();
  });

  it("checks once when the confirmed crop's window opens, and ignores a callback for a different crop", async () => {
    const store = new MemoryRunStore();
    const june = new Date("2025-06-01T14:00:00Z");
    const d = deps(recentDays(june, 4));
    const a = await runRecurringCheck("window", { version: 3, crop: "corn", seasonYear: 2025 }, on("corn"), store, {}, finney, june, d);
    const again = await runRecurringCheck("window", { version: 3, crop: "corn", seasonYear: 2025 }, on("corn"), store, {}, finney, june, d);
    expect(a!.runId).toBe("finney-ks:window:corn:2025:v3");
    expect(a!.reasons[0]!.text).toMatch(/not an observed crop stage, and not a forecast/);
    expect(again!.runId).toBe(a!.runId);
    expect(store.list(10)).toHaveLength(1);
    expect(await runRecurringCheck("window", { version: 3, crop: "corn", seasonYear: 2025 }, on("sorghum"), store, {}, finney, june, d)).toBeNull();
  });
});
