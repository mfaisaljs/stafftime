import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type {
  BreakType,
  Employee,
  MissedPunchStatus,
  MissedPunchType,
  Prisma,
} from "@prisma/client";
import prisma from "../db.server";
import { shopFromDest } from "../utils/http.server";
import {
  classifyAbsentDay,
  getApprovedTimeOffForRange,
  getManagerPayrollStatsForToday,
  getShopSettings,
  isHolidayDateKey,
  isEmployeeOnApprovedLeave,
  leaveCompensationForEmployeeDate,
} from "./settings.server";
import { normalizeClockPhoto, requireClockPhoto } from "./clock-photo.server";
import {
  SHIFT_STATUS,
  listApprovedLeaveDaysForEmployee,
  shiftIsCancelledForLeave,
  syncApprovedLeaveShiftCancellations,
} from "./time-off-shifts.server";
import {
  formatClockTime,
  formatDuration,
  formatTimerHms,
  summarizeTimeEntrySeconds,
  type HourFormat,
  type TimeFormat,
} from "./time-tracking.server";
import { assertStaffSeatAvailable } from "./billing.server";
import {
  addDaysToDateKey,
  endOfDayInTimeZone,
  endOfMonthInTimeZone,
  endOfWeekInTimeZone,
  formatClockTimeInTimeZone,
  parseZonedDateTime,
  resolveTimeZone,
  startOfDayInTimeZone,
  startOfMonthInTimeZone,
  startOfWeekInTimeZone,
  toDateKeyInTimeZone,
} from "../utils/timezone.server";

export type WorkforceStatus = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";
type EmployeeWithFirstLogin = Employee & { firstLoginAt: Date | null };

export async function ensureShop(destOrDomain: string) {
  const domain = shopFromDest(destOrDomain).toLowerCase();
  return prisma.shop.upsert({
    where: { domain },
    update: {},
    create: {
      domain,
      name: domain,
      settings: { create: {} },
    },
    include: { settings: true },
  });
}

export async function ensureDefaultLocation(shopId: string) {
  const existing = await prisma.storeLocation.findFirst({ where: { shopId } });
  if (existing) return existing;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  return prisma.storeLocation.create({
    data: {
      shopId,
      shopifyLocationId: "default",
      name: "Main Store",
      timezone: shop?.timezone ?? "UTC",
    },
  });
}

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, pinHash: string) {
  return bcrypt.compare(pin, pinHash);
}

export async function createEmployee(input: {
  shopId: string;
  locationId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  pin: string;
  role?: Employee["role"];
  status?: Employee["status"];
  firstLoginAt?: Date;
  hourlyRate?: number;
  position?: string;
  department?: string;
  locationAccess?: string;
  currency?: string;
  payrollType?: string;
  salaryAmount?: number;
  weeklyAvailability?: string;
  paymentMethod?: string;
  paypalEmail?: string;
  paypalAccountName?: string;
  bankAccountType?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  routingNumber?: string;
  swiftBic?: string;
  iban?: string;
  isShopifyStaff?: boolean;
}) {
  await assertPinAvailable(input.shopId, input.pin);
  await assertStaffSeatAvailable(input.shopId);

  return prisma.employee.create({
    data: {
      shopId: input.shopId,
      locationId: input.locationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      pinHash: await hashPin(input.pin),
      qrCode: randomUUID(),
      role: input.role ?? "EMPLOYEE",
      status: input.status ?? "INACTIVE",
      firstLoginAt: input.firstLoginAt,
      hourlyRate: input.hourlyRate ?? 0,
      position: input.position,
      department: input.department,
      locationAccess: input.locationAccess ?? "ALL",
      currency: input.currency ?? "USD",
      payrollType: input.payrollType ?? "HOURLY",
      salaryAmount: input.salaryAmount ?? 0,
      weeklyAvailability: input.weeklyAvailability,
      paymentMethod: input.paymentMethod ?? "PAYPAL",
      paypalEmail: input.paypalEmail,
      paypalAccountName: input.paypalAccountName,
      bankAccountType: input.bankAccountType,
      bankName: input.bankName,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      routingNumber: input.routingNumber,
      swiftBic: input.swiftBic,
      iban: input.iban,
      isShopifyStaff: input.isShopifyStaff ?? true,
    },
  });
}

export async function updateEmployee(input: {
  shopId: string;
  employeeId: string;
  locationId?: string | null;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  pin?: string;
  role?: Employee["role"];
  hourlyRate?: number;
  position?: string;
  department?: string;
  locationAccess?: string;
  currency?: string;
  payrollType?: string;
  salaryAmount?: number;
  weeklyAvailability?: string;
  paymentMethod?: string;
  paypalEmail?: string;
  paypalAccountName?: string;
  bankAccountType?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string | null;
  routingNumber?: string | null;
  swiftBic?: string | null;
  iban?: string | null;
}) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, shopId: input.shopId },
  });

  if (!employee) {
    throw new Error("Staff member not found");
  }

  const data = {
    locationId: input.locationId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    hourlyRate: input.hourlyRate ?? 0,
    position: input.position,
    department: input.department,
    locationAccess: input.locationAccess ?? "ALL",
    currency: input.currency ?? "USD",
    payrollType: input.payrollType ?? "HOURLY",
    salaryAmount: input.salaryAmount ?? 0,
    weeklyAvailability: input.weeklyAvailability,
    paymentMethod: input.paymentMethod ?? "PAYPAL",
    paypalEmail: input.paypalEmail,
    paypalAccountName: input.paypalAccountName,
    bankAccountType: input.bankAccountType,
    bankName: input.bankName,
    accountHolderName: input.accountHolderName,
    accountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    swiftBic: input.swiftBic,
    iban: input.iban,
    pinHash: undefined as string | undefined,
  };

  if (input.pin) {
    await assertPinAvailable(input.shopId, input.pin, input.employeeId);
    data.pinHash = await hashPin(input.pin);
  }

  return prisma.employee.update({
    where: { id: input.employeeId },
    data,
  });
}

export async function findPinMatches(shopId: string, pin: string) {
  const employees = await prisma.employee.findMany({
    where: { shopId },
  });

  const matches = [];
  for (const employee of employees) {
    if (await verifyPin(pin, employee.pinHash)) {
      matches.push(employee);
    }
  }

  return matches;
}

export async function assertPinAvailable(
  shopId: string,
  pin: string,
  excludeEmployeeId?: string,
) {
  const matches = await findPinMatches(shopId, pin);
  const conflict = matches.find((employee) => employee.id !== excludeEmployeeId);
  if (conflict) {
    throw new Error(
      `PIN already assigned to ${conflict.firstName} ${conflict.lastName}`,
    );
  }
}

export async function findEmployeeByPin(destOrDomain: string, pin: string) {
  const shop = await ensureShop(destOrDomain);
  const matches = (await findPinMatches(shop.id, pin)).filter((employee) =>
    canUseForLogin(employee as EmployeeWithFirstLogin),
  );

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new Error(
      "This PIN matches multiple employees. Ask your manager to assign unique PINs.",
    );
  }

  return matches[0];
}

export async function findEmployeeByQr(destOrDomain: string, qrCode: string) {
  const shop = await ensureShop(destOrDomain);
  return prisma.employee.findFirst({
    where: {
      shopId: shop.id,
      qrCode,
      OR: [{ status: "ACTIVE" }, { firstLoginAt: null }],
    },
  });
}

function canUseForLogin(employee: EmployeeWithFirstLogin) {
  if (employee.status === "ARCHIVED") {
    return false;
  }
  return employee.status === "ACTIVE" || employee.firstLoginAt === null;
}

export async function bulkArchiveEmployees(shopId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return { count: 0 };

  const result = await prisma.employee.updateMany({
    where: {
      shopId,
      id: { in: employeeIds },
      status: { not: "ARCHIVED" },
    },
    data: { status: "ARCHIVED" },
  });

  return { count: result.count };
}

function parseJsonIdArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

async function removeEmployeesFromCommissionPrograms(
  shopId: string,
  employeeIds: string[],
) {
  const removeSet = new Set(employeeIds);
  const programs = await prisma.commissionProgram.findMany({
    where: { shopId },
    select: { id: true, employeeIds: true },
  });

  await Promise.all(
    programs.map(async (program) => {
      const current = parseJsonIdArray(program.employeeIds);
      const next = current.filter((id) => !removeSet.has(id));
      if (next.length === current.length) return;
      await prisma.commissionProgram.update({
        where: { id: program.id },
        data: { employeeIds: JSON.stringify(next) },
      });
    }),
  );
}

async function removeEmployeesFromSalesTargets(
  shopId: string,
  employeeIds: string[],
) {
  const removeSet = new Set(employeeIds);
  const targets = await prisma.salesTarget.findMany({
    where: { shopId },
    select: { id: true, employeeIds: true },
  });

  await Promise.all(
    targets.map(async (target) => {
      const current = parseJsonIdArray(target.employeeIds);
      const next = current.filter((id) => !removeSet.has(id));
      if (next.length === current.length) return;

      if (next.length === 0) {
        await prisma.salesTarget.delete({ where: { id: target.id } });
        return;
      }

      await prisma.salesTarget.update({
        where: { id: target.id },
        data: { employeeIds: JSON.stringify(next) },
      });
    }),
  );

  await prisma.salesTargetSnapshot.deleteMany({
    where: {
      shopId,
      employeeId: { in: employeeIds },
    },
  });
}

export async function bulkDeleteEmployees(shopId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return { count: 0 };

  await removeEmployeesFromCommissionPrograms(shopId, employeeIds);
  await removeEmployeesFromSalesTargets(shopId, employeeIds);

  const result = await prisma.employee.deleteMany({
    where: {
      shopId,
      id: { in: employeeIds },
    },
  });

  return { count: result.count };
}

export async function activateEmployeeOnFirstLogin(employeeId: string) {
  const employee = (await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  })) as EmployeeWithFirstLogin;

  if (employee.firstLoginAt) {
    return employee;
  }

  return prisma.employee.update({
    where: { id: employee.id },
    data: {
      status: "ACTIVE",
      firstLoginAt: new Date(),
    },
  });
}

export async function getEmployeeShiftToday(
  employeeId: string,
  referenceDate = new Date(),
  timeZone?: string,
) {
  const resolvedTimeZone =
    timeZone ?? (await getEmployeeTimeZone(employeeId));
  const start = startOfDayInTimeZone(referenceDate, resolvedTimeZone);
  const end = endOfDayInTimeZone(referenceDate, resolvedTimeZone);

  return prisma.shift.findFirst({
    where: {
      employeeId,
      status: SHIFT_STATUS.SCHEDULED,
      startsAt: { gte: start, lte: end },
    },
    orderBy: { startsAt: "asc" },
  });
}

export type PosShiftRange = "upcoming" | "today" | "week" | "month";

export type PosShiftRow = {
  id: string;
  dateLabel: string;
  dayLabel: string;
  timeRangeLabel: string;
  status: "IN_PROGRESS" | "UPCOMING" | "COMPLETED" | "ON_LEAVE";
  statusLabel: string;
  tone: "warning" | "info" | "neutral" | "critical" | "success";
  startsAt: string;
  endsAt: string;
  locationName: string;
  cancelledForLeave?: boolean;
};

export type PosLeaveDayRow = {
  dateKey: string;
  dateLabel: string;
  dayLabel: string;
  policyName: string;
};

async function getEmployeeTimeZone(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { location: true, shop: true },
  });
  return resolveTimeZone(employee?.location, employee?.shop);
}

function rangeEndKeyForLeave(range: PosShiftRange, now: Date, timeZone: string) {
  const bounds = rangeBounds(range, now, timeZone);
  if (bounds.lte) return toDateKeyInTimeZone(bounds.lte, timeZone);
  return addDaysToDateKey(toDateKeyInTimeZone(now, timeZone), 90);
}

function formatShiftDateLabel(startsAt: Date, now: Date, timeZone: string) {
  if (
    toDateKeyInTimeZone(startsAt, timeZone) ===
    toDateKeyInTimeZone(now, timeZone)
  ) {
    return "Today";
  }
  return startsAt.toLocaleDateString(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShiftDayLabel(startsAt: Date, timeZone: string) {
  return startsAt.toLocaleDateString(undefined, { timeZone, weekday: "long" });
}

function classifyShiftStatus(
  startsAt: Date,
  endsAt: Date,
  now: Date,
): Pick<PosShiftRow, "status" | "statusLabel" | "tone"> {
  if (now.getTime() < startsAt.getTime()) {
    return { status: "UPCOMING", statusLabel: "Upcoming", tone: "success" };
  }
  if (now.getTime() > endsAt.getTime()) {
    return { status: "COMPLETED", statusLabel: "Completed", tone: "neutral" };
  }
  return { status: "IN_PROGRESS", statusLabel: "In Progress", tone: "warning" };
}

function rangeBounds(range: PosShiftRange, now: Date, timeZone: string) {
  switch (range) {
    case "today":
      return {
        gte: startOfDayInTimeZone(now, timeZone),
        lte: endOfDayInTimeZone(now, timeZone),
      };
    case "week":
      return {
        gte: startOfWeekInTimeZone(now, timeZone),
        lte: endOfWeekInTimeZone(now, timeZone),
      };
    case "month":
      return {
        gte: startOfMonthInTimeZone(now, timeZone),
        lte: endOfMonthInTimeZone(now, timeZone),
      };
    case "upcoming":
      return {
        gte: startOfDayInTimeZone(now, timeZone),
        lte: undefined as Date | undefined,
      };
  }
}

export async function listEmployeeShiftsForPos(params: {
  shopDomain: string;
  employeeId: string;
  range: PosShiftRange;
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
  const timeFormat = settings.timeFormat as TimeFormat;
  const now = new Date();
  const timeZone = resolveTimeZone(employee.location, shop);
  const bounds = rangeBounds(params.range, now, timeZone);

  await syncApprovedLeaveShiftCancellations(shop.id);

  const rangeStartKey = toDateKeyInTimeZone(bounds.gte, timeZone);
  const rangeEndKey = rangeEndKeyForLeave(params.range, now, timeZone);
  const leaveRequests = await getApprovedTimeOffForRange(
    shop.id,
    rangeStartKey,
    rangeEndKey,
  );
  const leaveDays = listApprovedLeaveDaysForEmployee(
    leaveRequests,
    employee.id,
    rangeStartKey,
    rangeEndKey,
  ).map((leave) => ({
    ...leave,
    dateLabel: formatShiftDateLabel(
      startOfDayInTimeZone(leave.dateKey, timeZone),
      now,
      timeZone,
    ),
    dayLabel: formatShiftDayLabel(startOfDayInTimeZone(leave.dateKey, timeZone), timeZone),
  }));

  const shifts = await prisma.shift.findMany({
    where: {
      shopId: shop.id,
      employeeId: employee.id,
      status: { in: [SHIFT_STATUS.SCHEDULED, SHIFT_STATUS.CANCELLED_LEAVE] },
      startsAt: {
        gte: bounds.gte,
        ...(bounds.lte ? { lte: bounds.lte } : {}),
      },
      ...(params.range === "upcoming" ? { endsAt: { gte: now } } : {}),
    },
    include: { location: true },
    orderBy: { startsAt: "asc" },
  });

  const todayKey = toDateKeyInTimeZone(now, timeZone);
  const onLeaveToday = isEmployeeOnApprovedLeave(
    leaveRequests,
    employee.id,
    todayKey,
  );
  const onLeaveInRange = leaveDays.length > 0;

  const rows: PosShiftRow[] = shifts.map((shift) => {
    const shiftTimeZone = resolveTimeZone(shift.location, employee.location, shop);
    const cancelled = shiftIsCancelledForLeave(
      shift,
      leaveRequests,
      employee.id,
      shiftTimeZone,
    );
    if (cancelled) {
      return {
        id: shift.id,
        dateLabel: formatShiftDateLabel(shift.startsAt, now, shiftTimeZone),
        dayLabel: formatShiftDayLabel(shift.startsAt, shiftTimeZone),
        timeRangeLabel: `${formatPosClockLabel(shift.startsAt, timeFormat, shiftTimeZone)} - ${formatPosClockLabel(shift.endsAt, timeFormat, shiftTimeZone)}`,
        status: "ON_LEAVE",
        statusLabel: "On leave",
        tone: "critical",
        startsAt: shift.startsAt.toISOString(),
        endsAt: shift.endsAt.toISOString(),
        locationName: shift.location.name,
        cancelledForLeave: true,
      };
    }
    const status = classifyShiftStatus(shift.startsAt, shift.endsAt, now);
    return {
      id: shift.id,
      dateLabel: formatShiftDateLabel(shift.startsAt, now, shiftTimeZone),
      dayLabel: formatShiftDayLabel(shift.startsAt, shiftTimeZone),
      timeRangeLabel: `${formatPosClockLabel(shift.startsAt, timeFormat, shiftTimeZone)} - ${formatPosClockLabel(shift.endsAt, timeFormat, shiftTimeZone)}`,
      ...status,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      locationName: shift.location.name,
      cancelledForLeave: false,
    };
  });

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
    },
    range: params.range,
    shifts: rows,
    leaveDays,
    onLeaveToday,
    onLeaveInRange,
    serverTime: Date.now(),
  };
}

export async function getOpenTimeEntry(employeeId: string) {
  return prisma.timeEntry.findFirst({
    where: { employeeId, status: "OPEN" },
    include: {
      location: true,
      breaks: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { clockInAt: "desc" },
  });
}

export type PosHistoryEvent = {
  id: string;
  type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
  label: string;
  at: string;
  atLabel: string;
  badge: string;
  tone: "success" | "critical" | "warning" | "neutral";
};

function formatPosClockLabel(
  value: Date,
  timeFormat: TimeFormat,
  timeZone: string,
) {
  return formatClockTimeInTimeZone(value, timeFormat, timeZone, true);
}

function buildTodayHistory(
  entries: Array<{
    id: string;
    clockInAt: Date;
    clockOutAt: Date | null;
    breaks: Array<{ id: string; startedAt: Date; endedAt: Date | null }>;
  }>,
  timeFormat: TimeFormat,
  timeZone: string,
): PosHistoryEvent[] {
  const events: PosHistoryEvent[] = [];
  for (const entry of entries) {
    events.push({
      id: `${entry.id}-in`,
      type: "CLOCK_IN",
      label: "Clock In",
      at: entry.clockInAt.toISOString(),
      atLabel: formatPosClockLabel(entry.clockInAt, timeFormat, timeZone),
      badge: "IN",
      tone: "success",
    });
    for (const breakEntry of entry.breaks) {
      events.push({
        id: `${breakEntry.id}-start`,
        type: "BREAK_START",
        label: "Start Break",
        at: breakEntry.startedAt.toISOString(),
        atLabel: formatPosClockLabel(breakEntry.startedAt, timeFormat, timeZone),
        badge: "BRK",
        tone: "warning",
      });
      if (breakEntry.endedAt) {
        events.push({
          id: `${breakEntry.id}-end`,
          type: "BREAK_END",
          label: "End Break",
          at: breakEntry.endedAt.toISOString(),
          atLabel: formatPosClockLabel(breakEntry.endedAt, timeFormat, timeZone),
          badge: "END",
          tone: "neutral",
        });
      }
    }
    if (entry.clockOutAt) {
      events.push({
        id: `${entry.id}-out`,
        type: "CLOCK_OUT",
        label: "Clock Out",
        at: entry.clockOutAt.toISOString(),
        atLabel: formatPosClockLabel(entry.clockOutAt, timeFormat, timeZone),
        badge: "OUT",
        tone: "critical",
      });
    }
  }
  return events.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

export async function buildEmployeeStatus(employeeId: string) {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: { location: true, shop: true },
  });
  const settings = await getShopSettings(employee.shopId);
  const now = new Date();
  const timeZone = resolveTimeZone(employee.location, employee.shop);
  const dayStart = startOfDayInTimeZone(now, timeZone);
  const weekStart = startOfWeekInTimeZone(now, timeZone);

  const [entry, shift, payrollStats, dayEntries, weekEntries] =
    await Promise.all([
      getOpenTimeEntry(employeeId),
      getEmployeeShiftToday(employeeId, now, timeZone),
      getManagerPayrollStatsForToday(employee.shopId, employeeId, settings),
      prisma.timeEntry.findMany({
        where: {
          employeeId,
          clockInAt: { gte: dayStart },
        },
        include: {
          location: true,
          breaks: { orderBy: { startedAt: "asc" } },
        },
        orderBy: { clockInAt: "asc" },
      }),
      prisma.timeEntry.findMany({
        where: {
          employeeId,
          clockInAt: { gte: weekStart },
        },
        include: {
          breaks: true,
        },
      }),
    ]);

  const openEntryFull =
    dayEntries.find((item) => item.clockOutAt == null) ?? null;
  const openBreak = openEntryFull?.breaks.find((item) => item.endedAt == null);

  let status: WorkforceStatus = "CLOCKED_OUT";
  let breakStartAt: string | undefined;
  if (openEntryFull) {
    if (openBreak) {
      status = "ON_BREAK";
      breakStartAt = openBreak.startedAt.toISOString();
    } else {
      status = "CLOCKED_IN";
    }
  }

  const summarizeOptions = { deductBreakTime: settings.deductBreakTime };
  const dayTotalSeconds = dayEntries.reduce(
    (sum, item) =>
      sum +
      summarizeTimeEntrySeconds(item, now, summarizeOptions).paidSeconds,
    0,
  );
  const weekTotalSeconds = weekEntries.reduce(
    (sum, item) =>
      sum +
      summarizeTimeEntrySeconds(item, now, summarizeOptions).paidSeconds,
    0,
  );
  const sessionSeconds = openEntryFull
    ? summarizeTimeEntrySeconds(openEntryFull, now, summarizeOptions)
        .paidSeconds
    : 0;

  const firstClockIn = dayEntries[0]?.clockInAt ?? openEntryFull?.clockInAt;
  const currentClockIn =
    openEntryFull?.clockInAt ?? dayEntries.at(-1)?.clockInAt;
  const locationName =
    openEntryFull?.location?.name ??
    entry?.location?.name ??
    employee.location?.name ??
    "POS";

  return {
    employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    status,
    clockInAt: openEntryFull?.clockInAt.toISOString(),
    clockInAtMs: openEntryFull?.clockInAt.getTime(),
    breakStartAt,
    shiftStart: shift?.startsAt.toISOString(),
    shiftEnd: shift?.endsAt.toISOString(),
    serverTime: now.getTime(),
    timeFormat: settings.timeFormat as TimeFormat,
    hourFormat: settings.hourFormat as HourFormat,
    locationName,
    dateLabel: now.toLocaleString(undefined, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
    firstClockInAt: firstClockIn?.toISOString(),
    firstClockInLabel: firstClockIn
      ? formatPosClockLabel(firstClockIn, settings.timeFormat as TimeFormat, timeZone)
      : "—",
    currentClockInAt: currentClockIn?.toISOString(),
    currentClockInLabel: currentClockIn
      ? formatPosClockLabel(currentClockIn, settings.timeFormat as TimeFormat, timeZone)
      : "—",
    dayTotalSeconds,
    dayTotalLabel: formatTimerHms(dayTotalSeconds),
    sessionSeconds,
    sessionLabel: formatTimerHms(sessionSeconds),
    weekTotalSeconds,
    weekTotalLabel: formatTimerHms(weekTotalSeconds),
    isRunning: status === "CLOCKED_IN" || status === "ON_BREAK",
    history: buildTodayHistory(
      dayEntries,
      settings.timeFormat as TimeFormat,
      timeZone,
    ),
    payrollStats: payrollStats
      ? {
          hours: payrollStats.hours,
          earnings: payrollStats.earnings,
          hoursLabel: formatDuration(
            Math.round(payrollStats.hours * 3600),
            settings.hourFormat as HourFormat,
          ),
          earningsLabel: payrollStats.earnings.toFixed(2),
        }
      : null,
  };
}

async function writeAudit(
  shopId: string,
  action: string,
  entityType: string,
  entityId: string,
  previous?: Prisma.InputJsonValue,
  next?: Prisma.InputJsonValue,
  actorId?: string,
) {
  await prisma.auditLog.create({
    data: {
      shopId,
      actorId,
      actorType: actorId ? "employee" : "system",
      action,
      entityType,
      entityId,
      previous: previous ? JSON.stringify(previous) : null,
      next: next ? JSON.stringify(next) : null,
    },
  });
}

export async function clockIn(params: {
  shopDomain: string;
  employeeId: string;
  locationId?: string;
  latitude?: number;
  longitude?: number;
  deviceId?: string;
  photo?: string | null;
  photoType?: string | null;
}) {
  const shop = await ensureShop(params.shopDomain);
  const location =
    (params.locationId
      ? await prisma.storeLocation.findFirst({
          where: { id: params.locationId, shopId: shop.id },
        })
      : null) ?? (await ensureDefaultLocation(shop.id));

  const openEntry = await getOpenTimeEntry(params.employeeId);
  if (openEntry) {
    throw new Error("Employee is already clocked in");
  }
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: shop.id },
  });
  if (!employee) {
    throw new Error("Staff member not found");
  }

  const settings = await getShopSettings(shop.id);
  const photoUrl = normalizeClockPhoto(params.photo, params.photoType);
  requireClockPhoto(settings.requirePhoto, photoUrl, "clock in");
  const timeZone = resolveTimeZone(location, shop);

  const shift = await getEmployeeShiftToday(params.employeeId, new Date(), timeZone);
  if (shift) {
    const now = Date.now();
    const shiftStartMs = shift.startsAt.getTime();
    if (!settings.allowEarlyClockIn && now < shiftStartMs) {
      throw new Error(
        `Clock-in is not allowed until shift starts at ${formatClockTime(shift.startsAt, settings.timeFormat as TimeFormat, timeZone)}`,
      );
    }
    if (settings.allowEarlyClockIn && settings.earlyClockInMinutes > 0) {
      const earliestMs =
        shiftStartMs - settings.earlyClockInMinutes * 60 * 1000;
      if (now < earliestMs) {
        throw new Error(
          `Clock-in is allowed up to ${settings.earlyClockInMinutes} minutes before shift start`,
        );
      }
    }
  }

  const entry = await prisma.timeEntry.create({
    data: {
      shopId: shop.id,
      locationId: location.id,
      employeeId: params.employeeId,
      clockInAt: new Date(),
      hourlyRateSnapshot: employee.hourlyRate,
      source: "POS",
      latitude: params.latitude,
      longitude: params.longitude,
      deviceId: params.deviceId,
      photoUrl: photoUrl ?? null,
    },
  });

  await writeAudit(shop.id, "clock_in", "TimeEntry", entry.id, undefined, {
    employeeId: params.employeeId,
    clockInAt: entry.clockInAt,
    hasPhoto: Boolean(photoUrl),
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function clockOut(params: {
  shopDomain: string;
  employeeId: string;
  notes?: string;
  photo?: string | null;
  photoType?: string | null;
}) {
  const shop = await ensureShop(params.shopDomain);
  const entry = await getOpenTimeEntry(params.employeeId);
  if (!entry) {
    throw new Error("Employee is not clocked in");
  }

  const settings = await getShopSettings(shop.id);
  const clockOutPhotoUrl = normalizeClockPhoto(params.photo, params.photoType);
  requireClockPhoto(settings.requirePhoto, clockOutPhotoUrl, "clock out");

  const openBreak = entry.breaks[0];
  if (openBreak) {
    await prisma.breakEntry.update({
      where: { id: openBreak.id },
      data: { endedAt: new Date() },
    });
  }

  const notes = params.notes?.trim();
  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      clockOutAt: new Date(),
      status: "CLOSED",
      ...(notes ? { notes } : {}),
      ...(clockOutPhotoUrl ? { clockOutPhotoUrl } : {}),
    },
  });

  await writeAudit(shop.id, "clock_out", "TimeEntry", updated.id, {
    status: "OPEN",
  }, {
    status: "CLOSED",
    clockOutAt: updated.clockOutAt,
    hasPhoto: Boolean(clockOutPhotoUrl),
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function startBreak(params: {
  shopDomain: string;
  employeeId: string;
  type?: BreakType;
}) {
  const shop = await ensureShop(params.shopDomain);
  const entry = await getOpenTimeEntry(params.employeeId);
  if (!entry) {
    throw new Error("Employee must be clocked in to start a break");
  }
  if (entry.breaks[0]) {
    throw new Error("Employee is already on break");
  }

  const settings = await getShopSettings(shop.id);
  if (settings.blockBreakAfterEndTime) {
    const timeZone = resolveTimeZone(entry.location, shop);
    const shift = await getEmployeeShiftToday(params.employeeId, new Date(), timeZone);
    if (shift && Date.now() > shift.endsAt.getTime()) {
      throw new Error("Breaks are not allowed after scheduled shift end time");
    }
  }

  const breakEntry = await prisma.breakEntry.create({
    data: {
      timeEntryId: entry.id,
      type: params.type ?? "UNPAID",
      startedAt: new Date(),
    },
  });

  await writeAudit(shop.id, "break_start", "BreakEntry", breakEntry.id, undefined, {
    employeeId: params.employeeId,
    startedAt: breakEntry.startedAt,
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function endBreak(params: {
  shopDomain: string;
  employeeId: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const entry = await getOpenTimeEntry(params.employeeId);
  if (!entry?.breaks[0]) {
    throw new Error("Employee is not on break");
  }

  const openBreak = entry.breaks[0];
  const updated = await prisma.breakEntry.update({
    where: { id: openBreak.id },
    data: { endedAt: new Date() },
  });

  await writeAudit(shop.id, "break_end", "BreakEntry", updated.id, {
    endedAt: null,
  }, {
    endedAt: updated.endedAt,
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function createMissedPunchRequest(params: {
  shopDomain: string;
  employeeId: string;
  type: MissedPunchType;
  requestedAt: Date;
  reason?: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  return prisma.missedPunchRequest.create({
    data: {
      shopId: shop.id,
      employeeId: params.employeeId,
      type: params.type,
      requestedAt: params.requestedAt,
      reason: params.reason,
    },
  });
}

export async function reviewMissedPunch(params: {
  shopDomain: string;
  requestId: string;
  status: Exclude<MissedPunchStatus, "PENDING">;
  reviewedBy: string;
  reviewNotes?: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const request = await prisma.missedPunchRequest.findFirst({
    where: { id: params.requestId, shopId: shop.id },
    include: { employee: true },
  });

  if (!request) {
    throw new Error("Missed punch request not found");
  }
  if (request.status !== "PENDING") {
    throw new Error("Request has already been reviewed");
  }

  const updated = await prisma.missedPunchRequest.update({
    where: { id: request.id },
    data: {
      status: params.status,
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: params.reviewNotes,
    },
  });

  if (params.status === "APPROVED") {
    const location = await ensureDefaultLocation(shop.id);
    if (request.type === "CLOCK_IN") {
      await prisma.timeEntry.create({
        data: {
          shopId: shop.id,
          locationId: location.id,
          employeeId: request.employeeId,
          clockInAt: request.requestedAt,
          clockOutAt: null,
          status: "OPEN",
          hourlyRateSnapshot: request.employee.hourlyRate,
          source: "MISSED_PUNCH",
          notes: request.reason,
        },
      });
    } else if (request.type === "CLOCK_OUT") {
      const openEntry = await getOpenTimeEntry(request.employeeId);
      if (openEntry) {
        await prisma.timeEntry.update({
          where: { id: openEntry.id },
          data: {
            clockOutAt: request.requestedAt,
            status: "CLOSED",
          },
        });
      }
    }
  }

  await writeAudit(
    shop.id,
    "missed_punch_review",
    "MissedPunchRequest",
    updated.id,
    { status: "PENDING" },
    { status: updated.status },
    params.reviewedBy,
  );

  return updated;
}

function parseManualEntryDateTime(date: string, time: string, timeZone: string) {
  return parseZonedDateTime(date, time, timeZone);
}

async function assertManualTimeEntryLocation(shopId: string, locationId: string) {
  const location = await prisma.storeLocation.findFirst({
    where: { id: locationId, shopId, active: true },
  });
  if (!location) {
    throw new Error("Choose a valid location.");
  }
  return location;
}

export async function createManualTimeEntry(params: {
  shopId: string;
  employeeId: string;
  locationId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string;
  notes?: string;
}) {
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: params.shopId },
  });
  if (!employee) {
    throw new Error("Staff member not found.");
  }

  const location = await assertManualTimeEntryLocation(
    params.shopId,
    params.locationId,
  );
  const shop = await prisma.shop.findUnique({ where: { id: params.shopId } });
  const timeZone = resolveTimeZone(location, shop);
  const clockInAt = parseManualEntryDateTime(
    params.date,
    params.clockInTime,
    timeZone,
  );
  const clockOutAt = parseManualEntryDateTime(
    params.date,
    params.clockOutTime,
    timeZone,
  );
  if (clockOutAt <= clockInAt) {
    throw new Error("Clock out must be after clock in.");
  }

  const entry = await prisma.timeEntry.create({
    data: {
      shopId: params.shopId,
      locationId: location.id,
      employeeId: params.employeeId,
      clockInAt,
      clockOutAt,
      status: "CLOSED",
      hourlyRateSnapshot: employee.hourlyRate,
      source: "MANUAL",
      notes: params.notes?.trim() || null,
    },
  });

  await writeAudit(
    params.shopId,
    "manual_time_entry_create",
    "TimeEntry",
    entry.id,
    undefined,
    {
      employeeId: params.employeeId,
      clockInAt: entry.clockInAt.toISOString(),
      clockOutAt: entry.clockOutAt?.toISOString(),
    },
  );

  return entry;
}

export async function updateManualTimeEntry(params: {
  shopId: string;
  employeeId: string;
  timeEntryId: string;
  locationId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string;
  notes?: string;
}) {
  const entry = await prisma.timeEntry.findFirst({
    where: {
      id: params.timeEntryId,
      shopId: params.shopId,
      employeeId: params.employeeId,
    },
  });
  if (!entry) {
    throw new Error("Time entry not found.");
  }

  const location = await assertManualTimeEntryLocation(
    params.shopId,
    params.locationId,
  );
  const shop = await prisma.shop.findUnique({ where: { id: params.shopId } });
  const timeZone = resolveTimeZone(location, shop);
  const clockInAt = parseManualEntryDateTime(
    params.date,
    params.clockInTime,
    timeZone,
  );
  const clockOutAt = parseManualEntryDateTime(
    params.date,
    params.clockOutTime,
    timeZone,
  );
  if (clockOutAt <= clockInAt) {
    throw new Error("Clock out must be after clock in.");
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      locationId: location.id,
      clockInAt,
      clockOutAt,
      status: "CLOSED",
      notes: params.notes?.trim() || null,
    },
  });

  await writeAudit(
    params.shopId,
    "manual_time_entry_update",
    "TimeEntry",
    updated.id,
    {
      clockInAt: entry.clockInAt.toISOString(),
      clockOutAt: entry.clockOutAt?.toISOString(),
      locationId: entry.locationId,
    },
    {
      clockInAt: updated.clockInAt.toISOString(),
      clockOutAt: updated.clockOutAt?.toISOString(),
      locationId: updated.locationId,
    },
  );

  return updated;
}

export async function getAttendanceSummary(shopDomain: string) {
  const shop = await ensureShop(shopDomain);
  const settings = await getShopSettings(shop.id);
  const timeZone = resolveTimeZone(shop);
  const start = startOfDayInTimeZone(new Date(), timeZone);
  const todayKey = toDateKeyInTimeZone(new Date(), timeZone);

  const [employees, openEntries, dayEntries, shifts, pendingRequests, timeOffRequests] =
    await Promise.all([
    prisma.employee.findMany({
      where: { shopId: shop.id, status: "ACTIVE" },
      include: { location: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        shopId: shop.id,
        status: "OPEN",
      },
      include: {
        employee: true,
        breaks: { where: { endedAt: null } },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        shopId: shop.id,
        clockInAt: { gte: start },
      },
      select: { employeeId: true },
    }),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        status: SHIFT_STATUS.SCHEDULED,
        startsAt: { gte: start },
      },
      include: { employee: true, location: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.missedPunchRequest.count({
      where: { shopId: shop.id, status: "PENDING" },
    }),
    getApprovedTimeOffForRange(shop.id, todayKey, todayKey),
  ]);

  const clockedInIds = new Set(openEntries.map((entry) => entry.employeeId));
  const punchedTodayIds = new Set(dayEntries.map((entry) => entry.employeeId));
  const onBreak = openEntries.filter((entry) => entry.breaks.length > 0);
  const working = openEntries.filter((entry) => entry.breaks.length === 0);
  const now = Date.now();

  const onLeave = employees.filter(
    (employee) =>
      !clockedInIds.has(employee.id) &&
      isEmployeeOnApprovedLeave(timeOffRequests, employee.id, todayKey),
  );
  const onLeaveIds = new Set(onLeave.map((employee) => employee.id));

  const absent = employees.filter((employee) => {
    if (onLeaveIds.has(employee.id)) return false;
    if (punchedTodayIds.has(employee.id)) return false;
    if (isHolidayDateKey(todayKey, settings)) return false;
    if (
      leaveCompensationForEmployeeDate(timeOffRequests, employee.id, todayKey)
    ) {
      return false;
    }
    const todayEndMs = endOfDayInTimeZone(todayKey, timeZone).getTime();
    const employeeShifts = shifts.filter(
      (shift) =>
        shift.employeeId === employee.id &&
        shift.startsAt.getTime() >= start.getTime() &&
        shift.startsAt.getTime() <= todayEndMs,
    );
    if (employeeShifts.length === 0) return false;
    // Live absent: every scheduled shift for today has already ended.
    return employeeShifts.every((shift) => shift.endsAt.getTime() < now);
  });

  const late = openEntries.filter((entry) => {
    if (onLeaveIds.has(entry.employeeId)) return false;
    const shift = shifts.find((item) => item.employeeId === entry.employeeId);
    if (!shift) return false;
    return entry.clockInAt.getTime() > shift.startsAt.getTime() + 5 * 60 * 1000;
  });

  return {
    workingCount: working.length,
    onBreakCount: onBreak.length,
    absentCount: absent.length,
    lateCount: late.length,
    pendingApprovals: pendingRequests,
    working,
    onBreak,
    absent,
    late,
    upcomingShifts: shifts,
    totalEmployees: employees.length,
  };
}

export type AttendanceStatus =
  | "working"
  | "on_break"
  | "on_leave"
  | "absent"
  | "late"
  | "off";

const LATE_GRACE_MS = 5 * 60 * 1000;

/** Attendance board for a date range (reports-style metrics + staff rows). */
export async function getAttendanceBoard(
  shopDomain: string,
  range: { start: string; end: string },
) {
  const shop = await ensureShop(shopDomain);
  const settings = await getShopSettings(shop.id);
  const timeZone = resolveTimeZone(shop);
  const rangeStart = startOfDayInTimeZone(range.start, timeZone);
  const rangeEnd = endOfDayInTimeZone(range.end, timeZone);
  const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
  const refKey =
    todayKey >= range.start && todayKey <= range.end ? todayKey : range.end;
  const refStart = startOfDayInTimeZone(refKey, timeZone);
  const refEnd = endOfDayInTimeZone(refKey, timeZone);
  const isLive = refKey === todayKey;

  const [employees, timeEntries, shifts, pendingApprovals, timeOffRequests] =
    await Promise.all([
    prisma.employee.findMany({
      where: { shopId: shop.id, status: "ACTIVE" },
      include: { location: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.timeEntry.findMany({
      where: {
        shopId: shop.id,
        OR: [
          {
            clockInAt: { gte: rangeStart, lte: rangeEnd },
          },
          ...(isLive ? [{ status: "OPEN" as const }] : []),
        ],
      },
      include: {
        location: true,
        breaks: { orderBy: { startedAt: "desc" } },
      },
      orderBy: { clockInAt: "desc" },
    }),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        status: SHIFT_STATUS.SCHEDULED,
        startsAt: { gte: rangeStart, lte: rangeEnd },
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.missedPunchRequest.count({
      where: { shopId: shop.id, status: "PENDING" },
    }),
    getApprovedTimeOffForRange(shop.id, refKey, refKey),
  ]);

  const rows = employees.map((employee) => {
    const employeeShifts = shifts.filter(
      (shift) => shift.employeeId === employee.id,
    );
    const refShifts = employeeShifts.filter(
      (shift) =>
        shift.startsAt.getTime() >= refStart.getTime() &&
        shift.startsAt.getTime() <= refEnd.getTime(),
    );
    const employeeEntries = timeEntries.filter(
      (entry) => entry.employeeId === employee.id,
    );
    const refEntries = employeeEntries.filter((entry) => {
      const inRefDay =
        entry.clockInAt.getTime() >= refStart.getTime() &&
        entry.clockInAt.getTime() <= refEnd.getTime();
      if (inRefDay) return true;
      return isLive && entry.status === "OPEN";
    });

    const openEntry =
      refEntries.find((entry) => entry.status === "OPEN") ??
      (isLive
        ? employeeEntries.find((entry) => entry.status === "OPEN")
        : undefined);
    const primaryEntry = openEntry ?? refEntries[0];
    const onLeave = isEmployeeOnApprovedLeave(
      timeOffRequests,
      employee.id,
      refKey,
    );

    const shiftForLate =
      refShifts[0] ??
      employeeShifts.find(
        (shift) =>
          primaryEntry &&
          Math.abs(shift.startsAt.getTime() - primaryEntry.clockInAt.getTime()) <
            24 * 60 * 60 * 1000,
      );
    const isLate =
      !onLeave &&
      Boolean(
        primaryEntry &&
          shiftForLate &&
          primaryEntry.clockInAt.getTime() >
            shiftForLate.startsAt.getTime() + LATE_GRACE_MS,
      );

    const hasClockInToday = refEntries.length > 0 || Boolean(openEntry);
    const leaveCompensation = leaveCompensationForEmployeeDate(
      timeOffRequests,
      employee.id,
      refKey,
    );
    const now = new Date();
    const allTodayShiftsEnded =
      refShifts.length > 0 &&
      refShifts.every((shift) => shift.endsAt.getTime() < now.getTime());

    let status: AttendanceStatus = "off";
    if (openEntry) {
      const onBreak = openEntry.breaks.some((item) => item.endedAt == null);
      status = onBreak ? "on_break" : "working";
    } else if (onLeave) {
      status = "on_leave";
    } else if (
      refShifts.length > 0 &&
      !hasClockInToday &&
      !isHolidayDateKey(refKey, settings) &&
      leaveCompensation === null &&
      // Past days: payroll-style absent. Live today: only after shift(s) ended.
      (isLive
        ? allTodayShiftsEnded
        : classifyAbsentDay(
            {
              dateKey: refKey,
              hasShift: true,
              hasClockIn: false,
              isHoliday: false,
              leaveCompensation: null,
            },
            settings,
          ))
    ) {
      status = "absent";
    } else if (!isLive && refEntries.length > 0) {
      // Historical day: had activity that day (not currently live).
      status = "working";
    } else if (isLate && !isLive) {
      status = "late";
    }
    // Live + clocked out (or never punched while shift still ongoing): stay "off".

    let punchStatus: "CLOCKED_IN" | "ON_BREAK" | "CLOCKED_OUT" | "NOT_STARTED" =
      "NOT_STARTED";
    let punchStatusLabel = "Not clocked in";
    if (openEntry) {
      const onBreak = openEntry.breaks.some((item) => item.endedAt == null);
      if (onBreak) {
        punchStatus = "ON_BREAK";
        punchStatusLabel = "On break";
      } else {
        punchStatus = "CLOCKED_IN";
        punchStatusLabel = "Clocked in";
      }
    } else if (refEntries.some((entry) => entry.status === "CLOSED")) {
      punchStatus = "CLOCKED_OUT";
      punchStatusLabel = "Clocked out";
    }

    const workedToday =
      Boolean(openEntry) ||
      refEntries.some((entry) => entry.status === "CLOSED" || entry.status === "OPEN");

    const locationName =
      openEntry?.location.name ??
      primaryEntry?.location.name ??
      refShifts[0]?.location.name ??
      employee.location?.name ??
      "—";

    const latestClosed = refEntries.find((entry) => entry.status === "CLOSED");
    const clockOutAt =
      punchStatus === "CLOCKED_OUT"
        ? (latestClosed?.clockOutAt?.toISOString() ?? null)
        : null;
    const rowTimeZone = resolveTimeZone(
      primaryEntry?.location,
      refShifts[0]?.location,
      employee.location,
      shop,
    );
    const shiftStart = (refShifts[0] ?? shiftForLate)?.startsAt ?? null;

    return {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      initials: initials(employee.firstName, employee.lastName),
      position: employee.position ?? "Staff",
      location: locationName,
      status,
      punchStatus,
      punchStatusLabel,
      workedToday,
      isLate: Boolean(isLate && status !== "absent" && status !== "on_leave"),
      clockInAt: primaryEntry?.clockInAt?.toISOString() ?? null,
      clockInLabel: primaryEntry
        ? formatClockTime(primaryEntry.clockInAt, settings.timeFormat as TimeFormat, rowTimeZone)
        : null,
      clockOutAt,
      clockOutLabel: latestClosed?.clockOutAt
        ? formatClockTime(latestClosed.clockOutAt, settings.timeFormat as TimeFormat, rowTimeZone)
        : null,
      shiftStartsAt: shiftStart?.toISOString() ?? null,
      shiftStartLabel: shiftStart
        ? formatClockTime(shiftStart, settings.timeFormat as TimeFormat, rowTimeZone)
        : null,
      entryStatus: primaryEntry?.status ?? null,
    };
  });

  const onLeaveCount = rows.filter((row) => row.status === "on_leave").length;
  // Working / On break metrics = currently on the floor only.
  const workingCount = rows.filter(
    (row) => row.punchStatus === "CLOCKED_IN",
  ).length;
  const onBreakCount = rows.filter(
    (row) => row.punchStatus === "ON_BREAK",
  ).length;
  const absentCount = rows.filter((row) => row.status === "absent").length;
  const lateCount = rows.filter((row) => row.isLate).length;

  return {
    refDate: refKey,
    live: isLive,
    timeZone,
    timeFormat: settings.timeFormat as TimeFormat,
    metrics: {
      working: workingCount,
      onBreak: onBreakCount,
      onLeave: onLeaveCount,
      absent: absentCount,
      late: lateCount,
      totalStaff: employees.length,
      pendingApprovals,
    },
    rows,
  };
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export async function resolveShopFromRequest(dest: string) {
  return ensureShop(shopFromDest(dest));
}
