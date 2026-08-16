import type { Employee, EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { isManagerRole, getShopSettings } from "./settings.server";
import { getStaffProfileForPos } from "./staff-profile.server";
import {
  buildEmployeeStatus,
  clockIn,
  clockOut,
  endBreak,
  ensureShop,
  getAttendanceBoard,
  startBreak,
  type AttendanceStatus,
} from "./workforce.server";

function toDateKeyLocal(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function attendanceLabel(status: AttendanceStatus) {
  switch (status) {
    case "working":
      return "Working";
    case "on_break":
      return "On break";
    case "on_leave":
      return "On leave";
    case "absent":
      return "Absent";
    case "late":
      return "Late";
    default:
      return "Off";
  }
}

function attendanceTone(
  status: AttendanceStatus,
): "success" | "warning" | "critical" | "info" | "neutral" {
  switch (status) {
    case "working":
      return "success";
    case "on_break":
      return "warning";
    case "on_leave":
      return "info";
    case "absent":
    case "late":
      return "critical";
    default:
      return "neutral";
  }
}

async function requireManager(params: {
  shopDomain: string;
  managerId: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const settings = await getShopSettings(shop.id);
  const manager = await prisma.employee.findFirst({
    where: { id: params.managerId, shopId: shop.id },
  });
  if (!manager || manager.status === "ARCHIVED") {
    throw new Error("Manager not found");
  }
  if (!isManagerRole(manager.role)) {
    throw new Error("Manager access required");
  }
  if (!settings.portalManagerView) {
    throw new Error("Manager View is disabled in Settings");
  }
  return { shop, settings, manager };
}

export async function bootstrapManagerViewForPos(params: {
  shopDomain: string;
  managerId: string;
}) {
  const { manager } = await requireManager(params);
  const today = toDateKeyLocal();
  const board = await getAttendanceBoard(params.shopDomain, {
    start: today,
    end: today,
  });

  const staff = board.rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    location: row.location,
    status: row.status,
    statusLabel: attendanceLabel(row.status),
    statusTone: attendanceTone(row.status),
    clockInLabel: row.clockInAt
      ? new Date(row.clockInAt).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      : null,
    isSelf: row.id === manager.id,
  }));

  return {
    manager: {
      id: manager.id,
      firstName: manager.firstName,
      lastName: manager.lastName,
      role: manager.role,
      roleLabel: roleBadgeLabel(manager.role, manager.position),
      canAccess: true,
    },
    metrics: {
      workingCount: board.metrics.working,
      onBreakCount: board.metrics.onBreak,
      onLeaveCount: board.metrics.onLeave,
      absentCount: board.metrics.absent,
      lateCount: board.metrics.late,
      totalCount: staff.length,
    },
    staff,
    serverTime: Date.now(),
  };
}

export async function getManagerViewStaffDetailForPos(params: {
  shopDomain: string;
  managerId: string;
  staffId: string;
  start?: string;
  end?: string;
  days?: number;
}) {
  await requireManager(params);

  const shop = await ensureShop(params.shopDomain);
  const staff = await prisma.employee.findFirst({
    where: { id: params.staffId, shopId: shop.id },
    include: { location: true },
  });
  if (!staff || staff.status === "ARCHIVED") {
    throw new Error("Staff member not found");
  }

  const [profile, clockStatus] = await Promise.all([
    getStaffProfileForPos({
      shopDomain: params.shopDomain,
      employeeId: params.staffId,
      start: params.start,
      end: params.end,
      days: params.days,
    }),
    buildEmployeeStatus(params.staffId),
  ]);

  const currency = staff.currency || "USD";
  const staffType =
    staff.role === "EMPLOYEE" ? "Staff" : roleBadgeLabel(staff.role, staff.position);

  return {
    profile,
    clockStatus,
    details: {
      id: staff.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      fullName: `${staff.firstName} ${staff.lastName}`.trim(),
      status: staff.status,
      statusLabel: staff.status === "ACTIVE" ? "Active" : staff.status,
      staffType,
      email: staff.email?.trim() || null,
      phone: staff.phone?.trim() || null,
      position: staff.position?.trim() || null,
      roleLabel: roleBadgeLabel(staff.role, staff.position),
      hourlyRate: staff.hourlyRate,
      hourlyRateLabel: formatMoney(staff.hourlyRate, currency),
      locationName: staff.location?.name ?? null,
      currency,
    },
    serverTime: Date.now(),
  };
}

export async function managerClockActionForPos(params: {
  shopDomain: string;
  managerId: string;
  staffId: string;
  action: "clock-in" | "clock-out" | "break-start" | "break-end";
  notes?: string;
}) {
  await requireManager(params);

  const shop = await ensureShop(params.shopDomain);
  const staff = await prisma.employee.findFirst({
    where: { id: params.staffId, shopId: shop.id, status: "ACTIVE" },
  });
  if (!staff) {
    throw new Error("Staff member not found");
  }

  let clockStatus;
  switch (params.action) {
    case "clock-in":
      clockStatus = await clockIn({
        shopDomain: params.shopDomain,
        employeeId: params.staffId,
      });
      break;
    case "clock-out":
      clockStatus = await clockOut({
        shopDomain: params.shopDomain,
        employeeId: params.staffId,
        notes: params.notes,
      });
      break;
    case "break-start":
      clockStatus = await startBreak({
        shopDomain: params.shopDomain,
        employeeId: params.staffId,
      });
      break;
    case "break-end":
      clockStatus = await endBreak({
        shopDomain: params.shopDomain,
        employeeId: params.staffId,
      });
      break;
  }

  await prisma.auditLog.create({
    data: {
      shopId: shop.id,
      actorId: params.managerId,
      actorType: "employee",
      action: `manager_${params.action.replace("-", "_")}`,
      entityType: "Employee",
      entityId: params.staffId,
      previous: null,
      next: JSON.stringify({
        status: clockStatus.status,
        byManagerId: params.managerId,
      }),
    },
  });

  return {
    clockStatus,
    serverTime: Date.now(),
  };
}

export type ManagerEmployee = Pick<
  Employee,
  "id" | "firstName" | "lastName" | "role" | "position"
>;
