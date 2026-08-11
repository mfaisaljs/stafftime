import type { EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop } from "./workforce.server";
import {
  clampRangeStartForSalary,
  computeSalaryAdjustments,
  countAbsentDays,
  enumerateDateKeys,
  getApprovedTimeOffForRange,
  getShopSettings,
} from "./settings.server";
import {
  filterRequestsForEmployee,
  SHIFT_STATUS,
} from "./time-off-shifts.server";
import {
  formatClockTime,
  formatDurationHms,
  summarizeTimeEntrySeconds,
  type HourFormat,
  type TimeFormat,
} from "./time-tracking.server";

export type StaffProfileTab = "overview" | "shifts" | "payroll";

function toDateKeyLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDayFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function endOfDayFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function normalizeDateKey(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function roleBadgeLabel(
  role: EmployeeRole,
  position: string | null | undefined,
) {
  if (position?.trim()) return position.trim();
  switch (role) {
    case "OWNER":
      return "Owner";
    case "REGIONAL_MANAGER":
      return "Regional Manager";
    case "STORE_MANAGER":
      return "Manager";
    case "SUPERVISOR":
      return "Supervisor";
    default:
      return "Staff";
  }
}

function formatShiftDateLabel(startsAt: Date, now: Date) {
  const startDay = new Date(startsAt);
  startDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (startDay.getTime() === today.getTime()) return "Today";
  return startsAt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(startsAt: Date, endsAt: Date, timeFormat: TimeFormat) {
  if (timeFormat === "24H") {
    const fmt = (value: Date) => {
      const hours = String(value.getHours()).padStart(2, "0");
      const minutes = String(value.getMinutes()).padStart(2, "0");
      const seconds = String(value.getSeconds()).padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    };
    return `${fmt(startsAt)} - ${fmt(endsAt)}`;
  }
  return `${formatClockTime(startsAt, timeFormat)} - ${formatClockTime(endsAt, timeFormat)}`;
}

function resolveRange(start?: string, end?: string, days?: number) {
  const today = toDateKeyLocal(new Date());
  const normalizedStart = normalizeDateKey(start);
  const normalizedEnd = normalizeDateKey(end);
  if (normalizedStart && normalizedEnd && normalizedStart <= normalizedEnd) {
    return { start: normalizedStart, end: normalizedEnd, days: 0 as number };
  }
  const preset = [7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (preset - 1));
  return {
    start: toDateKeyLocal(startDate),
    end: today,
    days: preset,
  };
}

export async function getStaffProfileForPos(params: {
  shopDomain: string;
  employeeId: string;
  start?: string;
  end?: string;
  days?: number;
}) {
  const shop = await ensureShop(params.shopDomain);
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: shop.id },
    include: { location: true },
  });
  if (!employee) {
    throw new Error("Employee not found");
  }

  const settings = await getShopSettings(shop.id);
  const hourFormat = settings.hourFormat as HourFormat;
  const timeFormat = settings.timeFormat as TimeFormat;
  const range = resolveRange(params.start, params.end, params.days);

  let startDate = startOfDayFromKey(range.start);
  const endDate = endOfDayFromKey(range.end);
  startDate = await clampRangeStartForSalary(
    shop.id,
    employee.id,
    startDate,
    settings,
  );
  const effectiveStartKey = toDateKeyLocal(startDate);

  const [timeEntries, shifts, timeOffRequests, payments] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        shopId: shop.id,
        employeeId: employee.id,
        clockInAt: { gte: startDate, lte: endDate },
      },
      include: { breaks: true, location: true },
      orderBy: { clockInAt: "desc" },
    }),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        employeeId: employee.id,
        status: {
          in: [SHIFT_STATUS.SCHEDULED, SHIFT_STATUS.CANCELLED_LEAVE],
        },
        startsAt: { gte: startDate, lte: endDate },
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
    }),
    getApprovedTimeOffForRange(shop.id, effectiveStartKey, range.end),
    prisma.payrollPayment.findMany({
      where: { shopId: shop.id, employeeId: employee.id },
      select: { amount: true, paymentType: true },
    }),
  ]);

  const now = new Date();
  const summarizeOptions = { deductBreakTime: settings.deductBreakTime };
  const summaries = timeEntries.map((entry) =>
    summarizeTimeEntrySeconds(entry, now, summarizeOptions),
  );
  const totalWorkedSeconds = summaries.reduce(
    (sum, item) => sum + item.totalWorkedSeconds,
    0,
  );
  const paidSeconds = summaries.reduce((sum, item) => sum + item.paidSeconds, 0);
  const breakSeconds = summaries.reduce(
    (sum, item) => sum + item.paidBreakSeconds + item.unpaidBreakSeconds,
    0,
  );
  const baseEarnings = timeEntries.reduce((sum, entry, index) => {
    const hourlyRate = entry.hourlyRateSnapshot ?? employee.hourlyRate;
    return sum + (summaries[index].paidSeconds / 3600) * hourlyRate;
  }, 0);

  const dateKeys = enumerateDateKeys(effectiveStartKey, range.end);
  const shiftsByDate = new Map<string, boolean>();
  for (const shift of shifts) {
    shiftsByDate.set(toDateKeyLocal(shift.startsAt), true);
  }
  const clockedDates = new Set(
    timeEntries.map((entry) => toDateKeyLocal(entry.clockInAt)),
  );
  const employeeTimeOff = filterRequestsForEmployee(timeOffRequests, employee.id);
  const totalAbsents = countAbsentDays(
    dateKeys,
    shiftsByDate,
    clockedDates,
    employeeTimeOff,
    settings,
  );
  const salaryAdjustment = computeSalaryAdjustments({
    employee,
    dateKeys,
    shiftsByDate,
    clockedDates,
    requests: employeeTimeOff,
    settings,
  });

  const totalCommission = 0;
  const totalBonus = 0;
  const totalEarnings = baseEarnings + salaryAdjustment + totalCommission + totalBonus;
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingAmount = Math.max(0, totalEarnings - totalPaid);
  const unpaidSalary = remainingAmount;
  const unpaidCommission = 0;
  const currency = employee.currency || "USD";
  const salaryAdjustmentLabel = formatMoney(salaryAdjustment, currency);

  type ProfileShift = {
    id: string;
    dateLabel: string;
    timeRangeLabel: string;
    locationName: string;
    isToday: boolean;
    startsAt: string;
    endsAt: string;
    badge: string;
    tone: "info" | "neutral" | "success";
  };
  const upcomingShifts: ProfileShift[] = [];
  const pastShifts: ProfileShift[] = [];
  for (const shift of shifts) {
    const isToday =
      toDateKeyLocal(shift.startsAt) === toDateKeyLocal(now);
    const row = {
      id: shift.id,
      dateLabel: formatShiftDateLabel(shift.startsAt, now),
      timeRangeLabel: formatTimeRange(shift.startsAt, shift.endsAt, timeFormat),
      locationName: shift.location.name,
      isToday,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
    };
    if (shift.endsAt.getTime() >= now.getTime()) {
      upcomingShifts.push({
        ...row,
        badge: isToday ? "Today" : "Upcoming",
        tone: isToday ? "info" : "neutral",
      });
    } else {
      pastShifts.push({
        ...row,
        badge: "Work",
        tone: "success",
      });
    }
  }

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      roleLabel: roleBadgeLabel(employee.role, employee.position),
      position: employee.position,
      locationName: employee.location?.name ?? null,
    },
    range: {
      start: effectiveStartKey,
      end: range.end,
      days: range.days,
    },
    overview: {
      totalHours: formatDurationHms(totalWorkedSeconds, hourFormat),
      workingHours: formatDurationHms(paidSeconds, hourFormat),
      breakTime: formatDurationHms(breakSeconds, hourFormat),
      absentDays: totalAbsents,
      baseEarnings: formatMoney(baseEarnings, currency),
      salaryAdjustment: salaryAdjustmentLabel,
      totalCommission: formatMoney(totalCommission, currency),
      totalBonus: formatMoney(totalBonus, currency),
      totalEarnings: formatMoney(totalEarnings, currency),
      paidAmount: formatMoney(totalPaid, currency),
      remainingAmount: formatMoney(remainingAmount, currency),
    },
    payroll: {
      baseEarnings: formatMoney(baseEarnings, currency),
      salaryAdjustment: salaryAdjustmentLabel,
      commission: formatMoney(totalCommission, currency),
      totalBonus: formatMoney(totalBonus, currency),
      totalEarnings: formatMoney(totalEarnings, currency),
      paidAmount: formatMoney(totalPaid, currency),
      remainingAmount: formatMoney(remainingAmount, currency),
      unpaidSalary: formatMoney(unpaidSalary, currency),
      unpaidCommission: formatMoney(unpaidCommission, currency),
    },
    shifts: {
      upcoming: upcomingShifts,
      past: pastShifts,
    },
    serverTime: Date.now(),
  };
}
