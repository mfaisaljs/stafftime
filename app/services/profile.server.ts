import type { EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop, getEmployeeShiftToday } from "./workforce.server";
import { getShopSettings, isManagerRole } from "./settings.server";
import {
  formatClockTime,
  type TimeFormat,
} from "./time-tracking.server";

function roleLabel(role: EmployeeRole) {
  if (role === "EMPLOYEE") return "Staff";
  switch (role) {
    case "OWNER":
      return "Owner";
    case "REGIONAL_MANAGER":
      return "Regional Manager";
    case "STORE_MANAGER":
      return "Store Manager";
    case "SUPERVISOR":
      return "Supervisor";
    default:
      return isManagerRole(role) ? "Manager" : "Staff";
  }
}

function formatShiftTime(value: Date, timeFormat: TimeFormat) {
  if (timeFormat === "24H") {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const seconds = String(value.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }
  return formatClockTime(value, timeFormat);
}

/** Matches screenshot title style: "Mh's Profile" / "Mh's Shifts" */
export function possessiveName(firstName: string) {
  const name = firstName.trim() || "Staff";
  return name.endsWith("s") || name.endsWith("S") ? `${name}'` : `${name}'s`;
}

export async function getEmployeeProfileForPos(params: {
  shopDomain: string;
  employeeId: string;
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
  const shift = await getEmployeeShiftToday(employee.id);
  const openEntry = await prisma.timeEntry.findFirst({
    where: { employeeId: employee.id, status: "OPEN" },
    include: {
      breaks: {
        where: { endedAt: null },
        take: 1,
      },
    },
    orderBy: { clockInAt: "desc" },
  });

  let clockStatus: "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK" = "CLOCKED_OUT";
  if (openEntry) {
    clockStatus = openEntry.breaks.length > 0 ? "ON_BREAK" : "CLOCKED_IN";
  }

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      titlePrefix: possessiveName(employee.firstName),
      role: employee.role,
      roleLabel: roleLabel(employee.role),
      position: employee.position?.trim() || "—",
      department: employee.department?.trim() || "—",
      email: employee.email?.trim() || "—",
      phone: employee.phone?.trim() || "—",
      status: employee.status,
      statusLabel:
        employee.status === "ACTIVE"
          ? "Active"
          : employee.status === "INACTIVE"
            ? "Inactive"
            : "Archived",
      locationName: employee.location?.name ?? "—",
    },
    clockStatus,
    clockStatusLabel:
      clockStatus === "CLOCKED_IN"
        ? "Currently Working"
        : clockStatus === "ON_BREAK"
          ? "On Break"
          : "Clocked Out",
    todayShift: shift
      ? {
          startsAt: shift.startsAt.toISOString(),
          endsAt: shift.endsAt.toISOString(),
          timeRangeLabel: `${formatShiftTime(shift.startsAt, timeFormat)} - ${formatShiftTime(shift.endsAt, timeFormat)}`,
        }
      : null,
    serverTime: Date.now(),
  };
}
