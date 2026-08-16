import type { Employee, EmployeeRole, Setting } from "@prisma/client";
import prisma from "../db.server";
import {
  activateEmployeeOnFirstLogin,
  findEmployeeByPin,
} from "./workforce.server";
import { getApprovedTimeOffForRange, getShopSettings, isManagerRole } from "./settings.server";
import {
  formatClockTime,
  summarizeTimeEntrySeconds,
  type HourFormat,
  type TimeFormat,
} from "./time-tracking.server";
import { normalizeShopDomain } from "../utils/portal-url.server";
import type { PortalFeatureKey } from "../utils/portal-path";
import {
  SHIFT_STATUS,
  shiftIsCancelledForLeave,
  syncApprovedLeaveShiftCancellations,
} from "./time-off-shifts.server";

export type PortalFeatureFlag = {
  key: PortalFeatureKey;
  enabled: boolean;
  managerOnly: boolean;
};

export function portalFeaturesFromSettings(settings: Setting): PortalFeatureFlag[] {
  return [
    { key: "clock", enabled: settings.portalClockIn, managerOnly: false },
    { key: "timesheet", enabled: settings.portalTimesheet, managerOnly: false },
    { key: "time-off", enabled: settings.portalTimeOff, managerOnly: false },
    { key: "profile", enabled: settings.portalProfileShifts, managerOnly: false },
    { key: "tasklists", enabled: settings.portalTaskList, managerOnly: false },
    { key: "manager", enabled: settings.portalManagerView, managerOnly: true },
    { key: "shifts", enabled: settings.portalViewShifts, managerOnly: false },
  ];
}

export function isPortalFeatureEnabled(
  settings: Setting,
  feature: PortalFeatureKey,
) {
  return (
    portalFeaturesFromSettings(settings).find((item) => item.key === feature)
      ?.enabled ?? false
  );
}

export async function findPortalShop(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);
  if (!domain) return null;
  return prisma.shop.findUnique({
    where: { domain },
    include: {
      settings: true,
      locations: {
        where: { active: true },
        orderBy: { name: "asc" },
        take: 1,
      },
    },
  });
}

export async function loadPortalShop(shopDomain: string) {
  const shop = await findPortalShop(shopDomain);
  if (!shop) {
    throw new Error("This shop does not have a StaffTime portal.");
  }
  const settings = shop.settings ?? (await getShopSettings(shop.id));
  return {
    shop,
    settings,
    locationName: shop.locations[0]?.name ?? shop.name ?? shop.domain,
    features: portalFeaturesFromSettings(settings),
  };
}

export async function verifyPortalPin(params: {
  shopDomain: string;
  pin: string;
  feature?: PortalFeatureKey;
}) {
  const pin = params.pin.trim();
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("Enter your 4-digit PIN.");
  }

  const { shop, settings, features } = await loadPortalShop(params.shopDomain);
  if (params.feature && !isPortalFeatureEnabled(settings, params.feature)) {
    throw new Error("This portal feature is disabled.");
  }

  const employee = await findEmployeeByPin(shop.domain, pin);
  if (!employee) {
    throw new Error("Invalid PIN");
  }

  if (params.feature === "manager" && !isManagerRole(employee.role)) {
    throw new Error("Manager access required");
  }

  const activated = await activateEmployeeOnFirstLogin(employee.id);
  return {
    shop,
    settings,
    features,
    employee: activated,
  };
}

export function toPortalSessionEmployee(
  shopDomain: string,
  employee: Employee,
) {
  return {
    shopDomain: normalizeShopDomain(shopDomain),
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    role: employee.role,
  };
}

export async function loadPortalEmployee(params: {
  shopDomain: string;
  employeeId: string;
}) {
  const { shop, settings, features, locationName } = await loadPortalShop(
    params.shopDomain,
  );
  const employee = await prisma.employee.findFirst({
    where: {
      id: params.employeeId,
      shopId: shop.id,
      status: { not: "ARCHIVED" },
    },
  });
  if (!employee) {
    throw new Error("Staff session expired. Enter your PIN again.");
  }
  return { shop, settings, features, locationName, employee };
}

export function assertPortalFeature(
  settings: Setting,
  feature: PortalFeatureKey,
  role: EmployeeRole,
) {
  if (!isPortalFeatureEnabled(settings, feature)) {
    throw new Error("This portal feature is disabled.");
  }
  if (feature === "manager" && !isManagerRole(role)) {
    throw new Error("Manager access required");
  }
}

export type PortalTimesheetShift = {
  id: string;
  timeRangeLabel: string;
  locationName: string;
  cancelled: boolean;
  color: string;
};

export type PortalTimesheetDay = {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  hoursLabel: string;
  paidSeconds: number;
  status: "worked" | "open" | "none";
  shifts: PortalTimesheetShift[];
};

export type PortalTimesheetWeek = {
  days: PortalTimesheetDay[];
  totalLabel: string;
};

export async function getPortalTimesheet(params: {
  shopDomain: string;
  employeeId: string;
  month?: string;
}) {
  const { shop, settings, employee } = await loadPortalEmployee(params);
  const month = resolveMonth(params.month);
  const monthStart = new Date(month.year, month.monthIndex, 1, 0, 0, 0, 0);
  const monthEnd = new Date(month.year, month.monthIndex + 1, 0, 23, 59, 59, 999);
  const gridStart = startOfMondayWeek(monthStart);
  const gridEnd = endOfSundayWeek(monthEnd);

  const hourFormat = settings.hourFormat as HourFormat;
  const timeFormat = settings.timeFormat as TimeFormat;
  const now = new Date();
  const todayKey = toDateKey(now);
  const staffColors = parseColorMap(settings.scheduleStaffColors);
  const locationColors = parseColorMap(settings.scheduleLocationColors);

  await syncApprovedLeaveShiftCancellations(shop.id);

  const [entries, shifts, leaveRequests] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        shopId: shop.id,
        employeeId: employee.id,
        clockInAt: { gte: gridStart, lte: gridEnd },
      },
      include: { breaks: true },
      orderBy: { clockInAt: "asc" },
    }),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        employeeId: employee.id,
        status: { in: [SHIFT_STATUS.SCHEDULED, SHIFT_STATUS.CANCELLED_LEAVE] },
        startsAt: { lte: gridEnd },
        endsAt: { gte: gridStart },
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
    }),
    getApprovedTimeOffForRange(shop.id, toDateKey(gridStart), toDateKey(gridEnd)),
  ]);

  const byDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = toDateKey(entry.clockInAt);
    const list = byDate.get(key) ?? [];
    list.push(entry);
    byDate.set(key, list);
  }

  const shiftsByDate = new Map<string, PortalTimesheetShift[]>();
  for (const shift of shifts) {
    const key = toDateKey(shift.startsAt);
    const cancelled = shiftIsCancelledForLeave(shift, leaveRequests, employee.id);
    const color =
      staffColors[employee.id] ||
      locationColors[shift.locationId] ||
      "#2563eb";
    const row: PortalTimesheetShift = {
      id: shift.id,
      timeRangeLabel: `${formatClockTime(shift.startsAt, timeFormat)} - ${formatClockTime(shift.endsAt, timeFormat)}`,
      locationName: shift.location.name,
      cancelled,
      color,
    };
    const list = shiftsByDate.get(key) ?? [];
    list.push(row);
    shiftsByDate.set(key, list);
  }

  const weeks: PortalTimesheetWeek[] = [];
  const days: PortalTimesheetDay[] = [];
  let monthPaidSeconds = 0;
  const cursor = new Date(gridStart);

  while (cursor.getTime() <= gridEnd.getTime()) {
    const weekDays: PortalTimesheetDay[] = [];
    let weekSeconds = 0;
    for (let i = 0; i < 7; i += 1) {
      const dateKey = toDateKey(cursor);
      const inMonth = cursor.getMonth() === month.monthIndex;
      const dayEntries = byDate.get(dateKey) ?? [];
      const paidSeconds = dayEntries.reduce(
        (sum, entry) =>
          sum +
          summarizeTimeEntrySeconds(entry, now, {
            deductBreakTime: settings.deductBreakTime,
          }).paidSeconds,
        0,
      );
      const open = dayEntries.some((entry) => !entry.clockOutAt);
      const dayShifts = shiftsByDate.get(dateKey) ?? [];
      const cell: PortalTimesheetDay = {
        dateKey,
        day: cursor.getDate(),
        inMonth,
        isToday: dateKey === todayKey,
        hoursLabel:
          paidSeconds > 0 ? formatTimesheetHours(paidSeconds, hourFormat) : "—",
        paidSeconds,
        status: open ? "open" : paidSeconds > 0 ? "worked" : "none",
        shifts: dayShifts,
      };
      weekDays.push(cell);
      if (inMonth) {
        days.push(cell);
        monthPaidSeconds += paidSeconds;
      }
      weekSeconds += inMonth ? paidSeconds : 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({
      days: weekDays,
      totalLabel:
        weekSeconds > 0 ? formatTimesheetHours(weekSeconds, hourFormat) : "—",
    });
  }

  return {
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    monthLabel: monthStart.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    month: month.key,
    prevMonth: shiftMonth(month.key, -1),
    nextMonth: shiftMonth(month.key, 1),
    totalHoursLabel: formatTimesheetHours(monthPaidSeconds, hourFormat),
    weeks,
    days,
  };
}

function formatTimesheetHours(totalSeconds: number, hourFormat: HourFormat) {
  if (hourFormat === "DECIMAL") {
    return `${(Math.max(0, totalSeconds) / 3600).toFixed(2)}h`;
  }
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function mondayOffset(value: Date) {
  return (value.getDay() + 6) % 7;
}

function startOfMondayWeek(value: Date) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - mondayOffset(start));
  return start;
}

function endOfSundayWeek(value: Date) {
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + (6 - mondayOffset(end)));
  return end;
}

function parseColorMap(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveMonth(raw?: string) {
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  const safe = new Date(year, monthIndex, 1);
  return {
    year: safe.getFullYear(),
    monthIndex: safe.getMonth(),
    key: `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, "0")}`,
  };
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}
