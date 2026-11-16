// Provider cadence policy; rationale and release sources: docs/DATA-FRESHNESS.md.
import type { CachePolicy } from "./cache";
import { DAY_SECONDS } from "./time";
export const FRESHNESS_VERSION = "fresh-v1";
export const HISTORY: CachePolicy = { softTtlSeconds: 365 * DAY_SECONDS, staleSeconds: 7 * DAY_SECONDS };
export const RECENT: CachePolicy = { softTtlSeconds: DAY_SECONDS, staleSeconds: DAY_SECONDS };
export const freshnessKey = (key: string, release?: string | number) => `${FRESHNESS_VERSION}:${key}${release === undefined ? "" : `:release-${release}`}`;

/** A full year is stable only when its last day is outside the conservative 90-day revision window. */
export function powerPolicy(endYear: number, now = new Date()): CachePolicy {
  return Date.UTC(endYear + 1, 0, 1) <= now.getTime() - 90 * DAY_SECONDS * 1000 ? HISTORY : RECENT;
}
export function modisPolicy(year: number, now = new Date()): CachePolicy {
  return year < now.getUTCFullYear() ? HISTORY : { softTtlSeconds: 16 * DAY_SECONDS, staleSeconds: DAY_SECONDS };
}
export function openetPolicy(endYear: number, now = new Date()): CachePolicy {
  return endYear < now.getUTCFullYear() ? HISTORY : { softTtlSeconds: 30 * DAY_SECONDS, staleSeconds: 7 * DAY_SECONDS };
}
export function soilRelease(now = new Date()): number { return now.getUTCFullYear() - (now.getUTCMonth() < 9 ? 1 : 0); }
// Daymet's release date varies; this is a verified release token, not an assumed January 1 update.
export const DAYMET_RELEASE = "v4-r1-2025-2026-05-22";

function easternTime(day: Date, hour: number, minute: number): number {
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" }).formatToParts(new Date(wall)).find(p => p.type === "timeZoneName")!.value;
  const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)!;
  return wall - (sign === "+" ? 1 : -1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
}
/** Release boundary in real Eastern time, including DST. Exact boundary belongs to the new release. */
export function nextWeeklyRelease(now: Date, weekday: number, hour: number, minute: number): Date {
  for (let i = 0; i <= 8; i++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    if (day.getUTCDay() !== weekday) continue;
    const release = easternTime(day, hour, minute);
    if (release > now.getTime()) return new Date(release);
  }
  throw new Error("weekly release not found");
}
export function untilRelease(release: Date, now = new Date()): number { return Math.max(1, (release.getTime() - now.getTime()) / 1000); }
export function usdmTtl(now = new Date()): number { return untilRelease(nextWeeklyRelease(now, 4, 8, 30), now); }
// Team publisher starts Monday 13:23 UTC; allow its documented 30-minute job timeout.
// Poll hourly during the publication window so a delayed publish cannot freeze last week's file.
export function kstateTtl(now = new Date()): number {
  if (now.getUTCDay() === 1 && now.getUTCHours() >= 13 && now.getUTCHours() < 18) return 3600;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14));
  next.setUTCDate(next.getUTCDate() + (1 - next.getUTCDay() + 7) % 7);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return untilRelease(next, now);
}

// Verified NASS 2026 county-yield and Agricultural Prices release calendar.
// Unknown future calendars fail fresh (daily polling), never assume the same dates next year.
export function nassRelease(kind: "yields" | "prices", now = new Date()): { token: string; ttl: number } {
  if (now.getUTCFullYear() !== 2026) return { token: now.toISOString().slice(0, 10), ttl: DAY_SECONDS };
  const days = kind === "yields" ? ["03-05", "05-05", "12-18"] : ["01-30", "02-27", "03-30", "04-30", "05-29", "06-29", "07-31", "08-31", "09-29", "10-30", "11-30", "12-30"];
  // A one-day polling window on release day handles publication time and delayed releases.
  const date = now.toISOString().slice(0, 10);
  const full = days.map(day => `2026-${day}`);
  const previous = full.filter(day => day <= date).at(-1) ?? "2025-final";
  const next = full.find(day => day > date) ?? "2027-01-01";
  return { token: previous, ttl: full.includes(date) ? DAY_SECONDS : Math.min(365 * DAY_SECONDS, untilRelease(new Date(`${next}T00:00:00Z`), now)) };
}

/** Fallbacks and unavailable values are returned to callers but not stored as successful source data. */
export function successful(policy: CachePolicy): CachePolicy {
  return { ...policy, cacheable: value => value !== null && !(typeof value === "object" && value !== null && (("available" in value && value.available === false) || ("savedCopy" in value && value.savedCopy === true) || ("status" in value && value.status === "unavailable"))) };
}
