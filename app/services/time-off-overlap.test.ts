import { describe, expect, it } from "vitest";
import { timeOffRangesOverlap } from "./time-off-shifts.server";

describe("timeOffRangesOverlap", () => {
  it("detects exact duplicate ranges", () => {
    expect(timeOffRangesOverlap("2026-08-10", "2026-08-12", "2026-08-10", "2026-08-12")).toBe(
      true,
    );
  });

  it("detects partial overlap", () => {
    expect(timeOffRangesOverlap("2026-08-10", "2026-08-15", "2026-08-13", "2026-08-20")).toBe(
      true,
    );
  });

  it("detects when one range contains another", () => {
    expect(timeOffRangesOverlap("2026-08-10", "2026-08-20", "2026-08-12", "2026-08-14")).toBe(
      true,
    );
  });

  it("allows adjacent non-overlapping ranges", () => {
    expect(timeOffRangesOverlap("2026-08-10", "2026-08-12", "2026-08-13", "2026-08-15")).toBe(
      false,
    );
  });

  it("allows separate non-overlapping ranges", () => {
    expect(timeOffRangesOverlap("2026-08-01", "2026-08-05", "2026-08-10", "2026-08-12")).toBe(
      false,
    );
  });
});
