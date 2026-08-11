import type { Employee, Setting, TimeOffRequest, TimeOffPolicy } from "@prisma/client";
import prisma from "../db.server";
import { summarizeTimeEntrySeconds } from "./time-tracking.server";

export type TimeOffRequestWithPolicy = TimeOffRequest & { policy: TimeOffPolicy };

const WEEKDAY_KEYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export async function getShopSettings(shopId: string): Promise<Setting> {
  return prisma.setting.upsert({
    where: { shopId },
    create: { shopId },
    update: {},
  });
}

export function parseHolidayWeekdays(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ["SUNDAY"];
    return parsed.filter(
      (value): value is string =>
        typeof value === "string" &&
        (WEEKDAY_KEYS as readonly string[]).includes(value),
    );
  } catch {
    return ["SUNDAY"];
  }
}

export function weekdayKeyFromDate(date: Date): string {
  return WEEKDAY_KEYS[date.getDay()];
}

export function isHolidayDateKey(dateKey: string, settings: Setting): boolean {
  const holidays = parseHolidayWeekdays(settings.holidayWeekdays);
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = weekdayKeyFromDate(new Date(year, month - 1, day));
  return holidays.includes(weekday);
}

export function enumerateDateKeys(start: string, end: string): string[] {
  const keys: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);

  while (cursor.getTime() <= endDate.getTime()) {
    keys.push(toDateKeyLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function dateKeyInRange(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}

export function requestCoversDateKey(
  request: Pick<TimeOffRequest, "startDate" | "endDate" | "status">,
  dateKey: string,
): boolean {
  return (
    request.status === "APPROVED" &&
    dateKey >= request.startDate &&
    dateKey <= request.endDate
  );
}

export function leaveCompensationForDate(
  requests: TimeOffRequestWithPolicy[],
  dateKey: string,
): "PAID" | "UNPAID" | null {
  const match = requests.find((request) => requestCoversDateKey(request, dateKey));
  if (!match) return null;
  return match.policy.compensation === "PAID" ? "PAID" : "UNPAID";
}

export function leaveCompensationForEmployeeDate(
  requests: TimeOffRequestWithPolicy[],
  employeeId: string,
  dateKey: string,
): "PAID" | "UNPAID" | null {
  const match = requests.find(
    (request) =>
      request.employeeId === employeeId &&
      requestCoversDateKey(request, dateKey),
  );
  if (!match) return null;
  return match.policy.compensation === "PAID" ? "PAID" : "UNPAID";
}

export function isEmployeeOnApprovedLeave(
  requests: TimeOffRequestWithPolicy[],
  employeeId: string,
  dateKey: string,
): boolean {
  return leaveCompensationForEmployeeDate(requests, employeeId, dateKey) !== null;
}

export type DayAttendanceContext = {
  dateKey: string;
  hasShift: boolean;
  hasClockIn: boolean;
  isHoliday: boolean;
  leaveCompensation: "PAID" | "UNPAID" | null;
};

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function classifyAbsentDay(
  context: DayAttendanceContext,
  settings: Setting,
): boolean {
  // Upcoming/today shifts are not absences yet — only completed past days.
  if (context.dateKey >= localDateKey()) return false;
  if (!context.hasShift || context.hasClockIn) return false;
  if (context.isHoliday) return false;

  if (context.leaveCompensation === "PAID") {
    return !settings.excludePaidLeavesFromAbsences;
  }
  if (context.leaveCompensation === "UNPAID") {
    return settings.includeUnpaidLeavesInAbsences;
  }

  return true;
}

export function countLeaveDays(
  dateKeys: string[],
  requests: TimeOffRequestWithPolicy[],
  compensation: "PAID" | "UNPAID",
): number {
  return dateKeys.filter((dateKey) => {
    return leaveCompensationForDate(requests, dateKey) === compensation;
  }).length;
}

export function countAbsentDays(
  dateKeys: string[],
  shiftsByDate: Map<string, boolean>,
  clockedDates: Set<string>,
  requests: TimeOffRequestWithPolicy[],
  settings: Setting,
): number {
  return dateKeys.filter((dateKey) =>
    classifyAbsentDay(
      {
        dateKey,
        hasShift: shiftsByDate.get(dateKey) ?? false,
        hasClockIn: clockedDates.has(dateKey),
        isHoliday: isHolidayDateKey(dateKey, settings),
        leaveCompensation: leaveCompensationForDate(requests, dateKey),
      },
      settings,
    ),
  ).length;
}

export type SalaryAdjustmentInput = {
  employee: Pick<Employee, "hourlyRate">;
  dateKeys: string[];
  shiftsByDate: Map<string, boolean>;
  clockedDates: Set<string>;
  requests: TimeOffRequestWithPolicy[];
  settings: Setting;
};

export function computeSalaryAdjustments(input: SalaryAdjustmentInput): number {
  const { employee, dateKeys, shiftsByDate, clockedDates, requests, settings } =
    input;
  const rate = employee.hourlyRate;
  const dayAmount = settings.defaultDailyWorkingHours * rate;
  const todayKey = localDateKey();
  let adjustment = 0;

  for (const dateKey of dateKeys) {
    // Do not apply leave/absence money for future dates in the selected range.
    if (dateKey > todayKey) continue;

    const leave = leaveCompensationForDate(requests, dateKey);
    if (leave === "PAID" && settings.autoAddPaidLeavesToSalary) {
      adjustment += dayAmount;
    }
    if (leave === "UNPAID" && settings.autoDeductUnpaidLeavesFromSalary) {
      adjustment -= dayAmount;
    }

    const absent = classifyAbsentDay(
      {
        dateKey,
        hasShift: shiftsByDate.get(dateKey) ?? false,
        hasClockIn: clockedDates.has(dateKey),
        isHoliday: isHolidayDateKey(dateKey, settings),
        leaveCompensation: leave,
      },
      settings,
    );
    if (absent && settings.autoDeductAbsencesFromSalary && leave === null) {
      adjustment -= dayAmount;
    }
  }

  return adjustment;
}

export async function clampRangeStartForSalary(
  shopId: string,
  employeeId: string,
  rangeStart: Date,
  settings: Setting,
): Promise<Date> {
  if (!settings.salaryAfterFirstClockIn) return rangeStart;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, shopId },
    select: { firstLoginAt: true },
  });
  if (employee?.firstLoginAt && employee.firstLoginAt > rangeStart) {
    return startOfDay(employee.firstLoginAt);
  }

  const firstEntry = await prisma.timeEntry.findFirst({
    where: { shopId, employeeId },
    orderBy: { clockInAt: "asc" },
    select: { clockInAt: true },
  });
  if (firstEntry && firstEntry.clockInAt > rangeStart) {
    return startOfDay(firstEntry.clockInAt);
  }

  return rangeStart;
}

export function isManagerRole(role: Employee["role"]): boolean {
  return (
    role === "OWNER" ||
    role === "REGIONAL_MANAGER" ||
    role === "STORE_MANAGER" ||
    role === "SUPERVISOR"
  );
}

export async function getManagerPayrollStatsForToday(
  shopId: string,
  employeeId: string,
  settings: Setting,
) {
  if (!settings.showPayrollStatsInPos) return null;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, shopId },
  });
  if (!employee || !isManagerRole(employee.role)) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: {
      shopId,
      employeeId,
      clockInAt: { gte: start, lte: end },
    },
    include: { breaks: true },
  });

  const reportEnd = new Date();
  let paidSeconds = 0;
  for (const entry of entries) {
    paidSeconds += summarizeTimeEntrySeconds(entry, reportEnd, {
      deductBreakTime: settings.deductBreakTime,
    }).paidSeconds;
  }

  const earnings = (paidSeconds / 3600) * employee.hourlyRate;
  return {
    hours: paidSeconds / 3600,
    earnings,
  };
}

export async function getApprovedTimeOffForRange(
  shopId: string,
  start: string,
  end: string,
): Promise<TimeOffRequestWithPolicy[]> {
  return prisma.timeOffRequest.findMany({
    where: {
      shopId,
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    include: { policy: true },
  });
}

function toDateKeyLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}
