import { describe, expect, it } from "vitest";
import {
  classifyAbsentDay,
  computeSalaryAdjustments,
  countAbsentDays,
} from "./settings.server";

function fakeSettings(overrides: Record<string, unknown> = {}) {
  return {
    autoDeductAbsencesFromSalary: true,
    autoDeductUnpaidLeavesFromSalary: true,
    autoAddPaidLeavesToSalary: true,
    excludePaidLeavesFromAbsences: true,
    includeUnpaidLeavesInAbsences: false,
    defaultDailyWorkingHours: 8,
    holidayDates: "[]",
    ...overrides,
  } as any;
}

describe("absence / salary adjustments ignore upcoming shifts", () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  it("does not mark today or future shift days as absent", () => {
    const settings = fakeSettings();
    expect(
      classifyAbsentDay(
        {
          dateKey: todayKey,
          hasShift: true,
          hasClockIn: false,
          isHoliday: false,
          leaveCompensation: null,
        },
        settings,
      ),
    ).toBe(false);
    expect(
      classifyAbsentDay(
        {
          dateKey: tomorrowKey,
          hasShift: true,
          hasClockIn: false,
          isHoliday: false,
          leaveCompensation: null,
        },
        settings,
      ),
    ).toBe(false);
  });

  it("still marks past missed shifts as absent", () => {
    const settings = fakeSettings();
    expect(
      classifyAbsentDay(
        {
          dateKey: yesterdayKey,
          hasShift: true,
          hasClockIn: false,
          isHoliday: false,
          leaveCompensation: null,
        },
        settings,
      ),
    ).toBe(true);
  });

  it("does not deduct salary for upcoming shifts in the range", () => {
    const settings = fakeSettings();
    const shiftsByDate = new Map([
      [yesterdayKey, true],
      [todayKey, true],
      [tomorrowKey, true],
    ]);
    const clockedDates = new Set<string>([todayKey]);
    const adjustment = computeSalaryAdjustments({
      employee: { hourlyRate: 10 },
      dateKeys: [yesterdayKey, todayKey, tomorrowKey],
      shiftsByDate,
      clockedDates,
      requests: [],
      settings,
    });
    // Only yesterday missed shift: -(8h * $10)
    expect(adjustment).toBe(-80);
    expect(
      countAbsentDays(
        [yesterdayKey, todayKey, tomorrowKey],
        shiftsByDate,
        clockedDates,
        [],
        settings,
      ),
    ).toBe(1);
  });

  it("does not deduct salary for both unpaid leave and absence on the same day", () => {
    const settings = fakeSettings({
      includeUnpaidLeavesInAbsences: true,
      autoDeductUnpaidLeavesFromSalary: true,
      autoDeductAbsencesFromSalary: true,
    });
    const shiftsByDate = new Map([[yesterdayKey, true]]);
    const requests = [
      {
        employeeId: "emp-1",
        startDate: yesterdayKey,
        endDate: yesterdayKey,
        status: "APPROVED",
        policy: { compensation: "UNPAID" },
      },
    ] as any;

    const adjustment = computeSalaryAdjustments({
      employee: { hourlyRate: 10 },
      dateKeys: [yesterdayKey],
      shiftsByDate,
      clockedDates: new Set<string>(),
      requests,
      settings,
    });

    expect(adjustment).toBe(-80);
  });

  it("does not deduct unpaid leave on calendar days with no scheduled shift", () => {
    const settings = fakeSettings({
      autoDeductUnpaidLeavesFromSalary: true,
    });
    const requests = [
      {
        employeeId: "emp-1",
        startDate: yesterdayKey,
        endDate: tomorrowKey,
        status: "APPROVED",
        policy: { compensation: "UNPAID" },
      },
    ] as any;

    const adjustment = computeSalaryAdjustments({
      employee: { hourlyRate: 20 },
      dateKeys: [yesterdayKey, todayKey, tomorrowKey],
      shiftsByDate: new Map(),
      clockedDates: new Set<string>(),
      requests,
      settings,
    });

    expect(adjustment).toBe(0);
  });

  it("deducts unpaid leave only on past/today work days covered by leave", () => {
    const settings = fakeSettings({
      autoDeductUnpaidLeavesFromSalary: true,
    });
    const requests = [
      {
        employeeId: "emp-1",
        startDate: yesterdayKey,
        endDate: tomorrowKey,
        status: "APPROVED",
        policy: { compensation: "UNPAID" },
      },
    ] as any;

    const adjustment = computeSalaryAdjustments({
      employee: { hourlyRate: 20 },
      dateKeys: [yesterdayKey, todayKey, tomorrowKey],
      shiftsByDate: new Map([
        [yesterdayKey, true],
        [tomorrowKey, true],
      ]),
      clockedDates: new Set<string>(),
      requests,
      settings,
    });

    // Yesterday work day on unpaid leave: -(8h * $20). Tomorrow is future → skipped.
    expect(adjustment).toBe(-160);
  });
});
