import type { Employee, EmployeeRole, Setting } from "@prisma/client";
import prisma from "../db.server";
import {
  activateEmployeeOnFirstLogin,
  findEmployeeByPin,
} from "./workforce.server";
import { getShopSettings, isManagerRole } from "./settings.server";
import {
  formatDuration,
  summarizeTimeEntrySeconds,
  type HourFormat,
} from "./time-tracking.server";
import { normalizeShopDomain } from "../utils/portal-url.server";
import type { PortalFeatureKey } from "../utils/portal-path";

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

export type PortalTimesheetDay = {
  dateKey: string;
  dateLabel: string;
  clockInLabel: string;
  clockOutLabel: string;
  hoursLabel: string;
  status: "worked" | "open" | "none";
};

export async function getPortalTimesheet(params: {
  shopDomain: string;
  employeeId: string;
  month?: string;
}) {
  const { shop, settings, employee } = await loadPortalEmployee(params);
  const month = resolveMonth(params.month);
  const start = new Date(month.year, month.monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(month.year, month.monthIndex + 1, 0, 23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: {
      shopId: shop.id,
      employeeId: employee.id,
      clockInAt: { gte: start, lte: end },
    },
    include: { breaks: true },
    orderBy: { clockInAt: "asc" },
  });

  const hourFormat = settings.hourFormat as HourFormat;
  const now = new Date();
  const byDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = toDateKey(entry.clockInAt);
    const list = byDate.get(key) ?? [];
    list.push(entry);
    byDate.set(key, list);
  }

  const days: PortalTimesheetDay[] = [];
  let totalPaidSeconds = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const dateKey = toDateKey(cursor);
    const dayEntries = byDate.get(dateKey) ?? [];
    const paidSeconds = dayEntries.reduce(
      (sum, entry) =>
        sum +
        summarizeTimeEntrySeconds(entry, now, {
          deductBreakTime: settings.deductBreakTime,
        }).paidSeconds,
      0,
    );
    totalPaidSeconds += paidSeconds;
    const first = dayEntries[0];
    const last = dayEntries.at(-1);
    const open = dayEntries.some((entry) => !entry.clockOutAt);
    days.push({
      dateKey,
      dateLabel: cursor.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      clockInLabel: first
        ? first.clockInAt.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : "—",
      clockOutLabel: last?.clockOutAt
        ? last.clockOutAt.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : open
          ? "In progress"
          : "—",
      hoursLabel: dayEntries.length
        ? formatDuration(paidSeconds, hourFormat, false)
        : "—",
      status: open ? "open" : dayEntries.length ? "worked" : "none",
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    monthLabel: start.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }),
    month: month.key,
    prevMonth: shiftMonth(month.key, -1),
    nextMonth: shiftMonth(month.key, 1),
    totalHoursLabel: formatDuration(totalPaidSeconds, hourFormat, false),
    days,
  };
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
