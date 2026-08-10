import { describe, expect, it } from "vitest";
import type { BreakEntry, TimeEntry } from "@prisma/client";
import {
  calculateBreakMinutes,
  formatClockTime,
  formatDuration,
  formatDurationHms,
  formatMinutes,
  minutesBetween,
  secondsBetween,
  summarizeTimeEntry,
  summarizeTimeEntrySeconds,
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
    hourlyRateSnapshot: null,
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

  it("keeps exact hours minutes and seconds without minute rounding", () => {
    const clockInAt = new Date("2026-08-09T09:00:00.000Z");
    const clockOutAt = new Date("2026-08-09T10:30:45.000Z");
    const entry = makeEntry(clockInAt, clockOutAt, [
      {
        id: "b1",
        timeEntryId: "entry-1",
        type: "UNPAID",
        startedAt: new Date("2026-08-09T09:15:10.000Z"),
        endedAt: new Date("2026-08-09T09:20:25.000Z"),
        createdAt: clockInAt,
        updatedAt: clockInAt,
      },
    ]);

    expect(secondsBetween(clockInAt, clockOutAt)).toBe(5445);
    const summary = summarizeTimeEntrySeconds(entry, clockOutAt);
    expect(summary.totalWorkedSeconds).toBe(5445);
    expect(summary.unpaidBreakSeconds).toBe(315);
    expect(summary.paidSeconds).toBe(5130);
    expect(formatDurationHms(summary.totalWorkedSeconds)).toBe("1h 30m 45s");
    expect(formatDurationHms(summary.paidSeconds)).toBe("1h 25m 30s");
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

  it("keeps paid seconds equal to worked time when break deduction is disabled", () => {
    const clockInAt = new Date("2026-08-09T09:00:00.000Z");
    const clockOutAt = new Date("2026-08-09T10:30:45.000Z");
    const entry = makeEntry(clockInAt, clockOutAt, [
      {
        id: "b1",
        timeEntryId: "entry-1",
        type: "UNPAID",
        startedAt: new Date("2026-08-09T09:15:10.000Z"),
        endedAt: new Date("2026-08-09T09:20:25.000Z"),
        createdAt: clockInAt,
        updatedAt: clockInAt,
      },
    ]);

    const summary = summarizeTimeEntrySeconds(entry, clockOutAt, {
      deductBreakTime: false,
    });
    expect(summary.paidSeconds).toBe(summary.totalWorkedSeconds);
  });

  it("deducts unpaid break when clock-in → break → clock-out without ending break first", () => {
    const clockInAt = new Date("2026-08-10T19:09:22.191Z");
    const breakStartedAt = new Date("2026-08-10T19:09:26.482Z");
    const breakEndedAt = new Date("2026-08-10T19:25:35.862Z");
    const clockOutAt = new Date("2026-08-10T19:25:43.407Z");
    const entry = makeEntry(clockInAt, clockOutAt, [
      {
        id: "b1",
        timeEntryId: "entry-1",
        type: "UNPAID",
        startedAt: breakStartedAt,
        endedAt: breakEndedAt,
        createdAt: clockInAt,
        updatedAt: clockInAt,
      },
    ]);

    const summary = summarizeTimeEntrySeconds(entry, clockOutAt, {
      deductBreakTime: true,
    });
    expect(summary.totalWorkedSeconds).toBe(981);
    expect(summary.unpaidBreakSeconds).toBe(969);
    expect(summary.paidSeconds).toBe(12);
    expect(formatDurationHms(summary.paidSeconds)).toBe("0h 0m 12s");
  });

  it("formats durations in decimal hour format", () => {
    expect(formatDuration(5400, "DECIMAL")).toBe("1.50h");
    expect(formatDurationHms(5400, "DECIMAL")).toBe("1.50h");
  });

  it("formats clock times for 24H and 12H", () => {
    const value = new Date("2026-08-09T14:30:00.000Z");
    expect(formatClockTime(value, "24H")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatClockTime(value, "12H")).toBeTruthy();
  });
});
