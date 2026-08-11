import { describe, expect, it } from "vitest";
import {
  periodKeyForTimeline,
  startOfLocalMonth,
  startOfLocalWeek,
  toDateKey,
} from "./tasklists.server";

describe("task list period keys", () => {
  it("uses the calendar day for daily tasks", () => {
    const at = new Date(2026, 7, 12, 15, 30, 0); // Aug 12, 2026
    expect(periodKeyForTimeline("DAILY", at)).toBe("2026-08-12");
  });

  it("uses Sunday week start for weekly tasks", () => {
    // Wednesday Aug 12, 2026 → week starts Sunday Aug 9
    const at = new Date(2026, 7, 12, 10, 0, 0);
    expect(toDateKey(startOfLocalWeek(at))).toBe("2026-08-09");
    expect(periodKeyForTimeline("WEEKLY", at)).toBe("2026-08-09");
    expect(periodKeyForTimeline("WEEKLY", new Date(2026, 7, 15))).toBe(
      "2026-08-09",
    );
  });

  it("uses the first of the month for monthly tasks", () => {
    const at = new Date(2026, 7, 28, 9, 0, 0);
    expect(toDateKey(startOfLocalMonth(at))).toBe("2026-08-01");
    expect(periodKeyForTimeline("MONTHLY", at)).toBe("2026-08-01");
  });

  it("keeps weekly completion stable across the same week", () => {
    const monday = periodKeyForTimeline("WEEKLY", new Date(2026, 7, 10));
    const saturday = periodKeyForTimeline("WEEKLY", new Date(2026, 7, 15));
    expect(monday).toBe(saturday);
  });

  it("rolls weekly completion to the next Sunday", () => {
    const saturday = periodKeyForTimeline("WEEKLY", new Date(2026, 7, 15));
    const nextSunday = periodKeyForTimeline("WEEKLY", new Date(2026, 7, 16));
    expect(saturday).toBe("2026-08-09");
    expect(nextSunday).toBe("2026-08-16");
  });
});
