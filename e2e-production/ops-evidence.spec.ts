import { test } from "@playwright/test";
import { dailyFlightProfile, type ProfileRow } from "../lib/airport-day-profile";
import { radar, similarDays, terminalDay, type TerminalDay } from "../lib/airport-day-compare";

/**
 * Evidence run, manual dispatch only (read-only):
 *  A. what /api/live/airport-days returns right now (stored profiles);
 *  B. a LOCAL recompute of the same profiles from the public flight records of
 *     the last 28 days, and the comparison results that recompute gives.
 * B is a check of the pipeline on real rows, not a stored or operational result.
 */
const DAYS = Number(process.env.OPS_DAYS ?? 28);
const END = process.env.OPS_END ?? "2026-09-30";
const shift = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const log = (label: string, value: unknown) => console.log(`OPS ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

test("airport-days state and local recompute", async ({ request }) => {
  test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
  test.setTimeout(240_000);
  log("now", new Date().toISOString());
  for (const date of ["2026-10-01", END]) {
    const response = await request.get(`/api/live/airport-days?date=${date}`);
    const body = await response.json().catch(() => null);
    log(`airport-days ${date} status`, response.status());
    if (body) {
      log(`airport-days ${date}`, { mode: body.mode, rowsRead: body.rowsRead, withoutProfile: body.withoutProfile, validDays: body.history?.length,
        days: (body.history ?? []).map((h: { T1: TerminalDay; T2: TerminalDay }) => ({ day: h.T1.day, complete: h.T1.complete, T1: h.T1.total, T2: h.T2.total })) });
    }
  }

  const profiles = new Map<string, { rows: number; withId: number; truncated: boolean; T1: TerminalDay; T2: TerminalDay }>();
  for (let offset = DAYS; offset >= 0; offset--) {
    const day = shift(END, -offset);
    const response = await request.get(`/api/live/flights?date=${day}`);
    const body = await response.json().catch(() => null);
    const all = (body?.flights ?? []) as Array<ProfileRow & { direction?: string }>;
    const departures = all.filter((row) => row.direction === "departure");
    const withId = departures.filter((row) => row.physicalFlightId);
    // Same selection as the collector: departures with a physical flight id.
    const profile = dailyFlightProfile(withId, day, offset > 0);
    profiles.set(day, { rows: departures.length, withId: withId.length, truncated: !!body?.truncated, T1: terminalDay(profile, "T1"), T2: terminalDay(profile, "T2") });
    log(`flights ${day}`, { status: response.status(), mode: body?.mode, departures: departures.length, withPhysicalId: withId.length, truncated: !!body?.truncated,
      T1: profiles.get(day)!.T1.total, T2: profiles.get(day)!.T2.total, unknownBuilding: profile.unknownBuilding, cancelled: profile.cancelled });
  }

  // The comparison the page would show for END (a finished day), from days before it.
  for (const terminal of ["T1", "T2"] as const) {
    const current = profiles.get(END)![terminal];
    const history = [...profiles.entries()].filter(([day, value]) => day < END && value.rows > 0 && !value.truncated).map(([, value]) => value[terminal]);
    const result = radar({ current, history, lastSeen: null, terminal, holidays: [] });
    log(`radar ${END} ${terminal}`, { historyDays: history.length, sameWeekdayDays: result.weekdayDays.map((d) => `${d.day}:${d.total}`), items: result.items });
    const similar = similarDays({ current, history });
    log(`similar ${END} ${terminal}`, similar.map((s) => ({ day: s.day.day, total: s.day.total, distance: Number(s.distance.toFixed(3)), components: s.components.map((c) => `${c.name}:${c.distance.toFixed(2)}`), missing: s.missing })));
  }
});
