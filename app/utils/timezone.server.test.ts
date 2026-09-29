import { describe, expect, it } from "vitest";
import {
  formatClockTimeInTimeZone,
  parseZonedDateTime,
  resolveTimeZone,
  startOfDayInTimeZone,
  toDateKeyInTimeZone,
} from "./timezone.server";
import { formatClockTime } from "../services/time-tracking.server";

describe("timezone utilities", () => {
  it("formats UTC instants in the requested IANA timezone", () => {
    const value = new Date("2026-08-09T15:03:00.000Z");

    expect(formatClockTimeInTimeZone(value, "24H", "America/New_York")).toBe(
      "11:03",
    );
    expect(formatClockTime(value, "24H", "America/New_York")).toBe("11:03");
    expect(toDateKeyInTimeZone(value, "America/New_York")).toBe("2026-08-09");
  });

  it("parses store-local wall-clock time into the matching UTC instant", () => {
    const value = parseZonedDateTime(
      "2026-08-09",
      "11:03",
      "America/New_York",
    );

    expect(value.toISOString()).toBe("2026-08-09T15:03:00.000Z");
  });

  it("computes day boundaries in the selected timezone", () => {
    const value = new Date("2026-08-10T03:30:00.000Z");

    expect(toDateKeyInTimeZone(value, "America/New_York")).toBe("2026-08-09");
    expect(startOfDayInTimeZone(value, "America/New_York").toISOString()).toBe(
      "2026-08-09T04:00:00.000Z",
    );
  });

  it("resolves timezone from location, then shop, then UTC", () => {
    expect(
      resolveTimeZone(
        { timezone: "America/New_York" },
        { timezone: "America/Chicago" },
      ),
    ).toBe("America/New_York");
    expect(resolveTimeZone({ timezone: "UTC" }, { timezone: "America/Chicago" })).toBe(
      "America/Chicago",
    );
    expect(resolveTimeZone({ timezone: "Not/AZone" })).toBe("UTC");
  });
});
