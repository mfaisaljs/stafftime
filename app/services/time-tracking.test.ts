import { describe, expect, it } from "vitest";
import type { BreakEntry, TimeEntry } from "@prisma/client";
import {
  calculateBreakMinutes,
  formatMinutes,
  minutesBetween,
  summarizeTimeEntry,
  summarizeWeeklyOvertime,
} from "./time-tracking.server";

function makeEntry(
  clockInAt: Date,
  clockOutAt: Date | null,
  breaks: BreakEntry[] = [],
): TimeEntry & { breaks: BreakEntry[] } {
  return {
    id: "entry-1",
    shopId: "shop-1",
    locationId: "loc-1",
    employeeId: "emp-1",
    clockInAt,
    clockOutAt,
    status: clockOutAt ? "CLOSED" : "OPEN",
    source: "POS",
    deviceId: null,
    latitude: null,
    longitude: null,
    photoUrl: null,
    notes: null,
    createdAt: clockInAt,
    updatedAt: clockInAt,
    breaks,
  };
}

describe("time-tracking", () => {
  it("calculates minutes between timestamps", () => {
    const start = new Date("2026-08-09T09:00:00.000Z");
    const end = new Date("2026-08-09T10:30:00.000Z");
    expect(minutesBetween(start, end)).toBe(90);
  });

  it("separates paid and unpaid break minutes", () => {
    const start = new Date("2026-08-09T09:00:00.000Z");
    const end = new Date("2026-08-09T17:00:00.000Z");
    const breaks: BreakEntry[] = [
      {
        id: "b1",
        timeEntryId: "entry-1",
        type: "UNPAID",
        startedAt: new Date("2026-08-09T12:00:00.000Z"),
        endedAt: new Date("2026-08-09T12:30:00.000Z"),
        createdAt: start,
        updatedAt: start,
      },
      {
        id: "b2",
        timeEntryId: "entry-1",
        type: "PAID",
        startedAt: new Date("2026-08-09T15:00:00.000Z"),
        endedAt: new Date("2026-08-09T15:15:00.000Z"),
        createdAt: start,
        updatedAt: start,
      },
    ];

    const result = calculateBreakMinutes(breaks, end);
    expect(result.unpaidBreakMinutes).toBe(30);
    expect(result.paidBreakMinutes).toBe(15);
  });

  it("calculates daily overtime after threshold", () => {
    const clockInAt = new Date("2026-08-09T08:00:00.000Z");
    const clockOutAt = new Date("2026-08-09T18:00:00.000Z");
    const entry = makeEntry(clockInAt, clockOutAt, [
      {
        id: "b1",
        timeEntryId: "entry-1",
        type: "UNPAID",
        startedAt: new Date("2026-08-09T12:00:00.000Z"),
        endedAt: new Date("2026-08-09T12:30:00.000Z"),
        createdAt: clockInAt,
        updatedAt: clockInAt,
      },
    ]);

    const summary = summarizeTimeEntry(entry, { overtimeDailyHours: 8 }, clockOutAt);
    expect(summary.totalWorkedMinutes).toBe(600);
    expect(summary.paidMinutes).toBe(570);
    expect(summary.overtimeMinutes).toBe(90);
    expect(formatMinutes(summary.overtimeMinutes)).toBe("1h 30m");
  });

  it("calculates weekly overtime using the higher of daily and weekly thresholds", () => {
    const settings = { overtimeDailyHours: 8, overtimeWeeklyHours: 40 };
    const dayOneIn = new Date("2026-08-05T08:00:00.000Z");
    const dayOneOut = new Date("2026-08-05T18:00:00.000Z");
    const dayTwoIn = new Date("2026-08-06T08:00:00.000Z");
    const dayTwoOut = new Date("2026-08-06T18:00:00.000Z");

    const entries = [
      makeEntry(dayOneIn, dayOneOut),
      makeEntry(dayTwoIn, dayTwoOut),
    ];

    const summary = summarizeWeeklyOvertime(entries, settings, dayTwoOut);
    expect(summary.paidMinutes).toBe(1200);
    expect(summary.overtimeMinutes).toBeGreaterThan(0);
  });
});
