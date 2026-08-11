import type { Employee, EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop } from "./workforce.server";
import { isManagerRole } from "./settings.server";

export type PosTaskListTab = "all" | "daily" | "weekly" | "monthly";

export type PosTaskListRow = {
  id: string;
  name: string;
  description: string | null;
  timelines: Array<"DAILY" | "WEEKLY" | "MONTHLY">;
  timelineLabels: string[];
  taskCount: number;
  completedCount: number;
  progressLabel: string;
  assignedAs: "Staff" | "Manager";
};

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value)).filter(Boolean);
  } catch {
    return [];
  }
}

function todayDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timelineLabel(value: string) {
  switch (value) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    default:
      return value;
  }
}

function roleBucket(role: EmployeeRole): "staff" | "manager" | null {
  if (role === "EMPLOYEE") return "staff";
  if (isManagerRole(role)) return "manager";
  return null;
}

function isAssignedToEmployee(
  list: {
    assignStaff: boolean;
    assignManagers: boolean;
    staffScope: string;
    managerScope: string;
    employeeIds: string;
    managerIds: string;
  },
  employee: Employee,
): "Staff" | "Manager" | null {
  const bucket = roleBucket(employee.role);
  if (bucket === "staff") {
    if (!list.assignStaff) return null;
    if (
      list.staffScope === "SELECTED" &&
      !parseJsonArray(list.employeeIds).includes(employee.id)
    ) {
      return null;
    }
    return "Staff";
  }
  if (bucket === "manager") {
    if (!list.assignManagers) return null;
    if (
      list.managerScope === "SELECTED" &&
      !parseJsonArray(list.managerIds).includes(employee.id)
    ) {
      return null;
    }
    return "Manager";
  }
  return null;
}

function matchesLocation(
  list: { locationAccess: string; locationIds: string },
  employee: Employee,
) {
  if (list.locationAccess !== "SPECIFIC") return true;
  if (!employee.locationId) return false;
  return parseJsonArray(list.locationIds).includes(employee.locationId);
}

function matchesTab(
  timelines: string[],
  tab: PosTaskListTab,
) {
  if (tab === "all") return true;
  return timelines.includes(tab.toUpperCase());
}

export async function listEmployeeTaskListsForPos(params: {
  shopDomain: string;
  employeeId: string;
  tab: PosTaskListTab;
}) {
  const shop = await ensureShop(params.shopDomain);
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: shop.id },
  });
  if (!employee) {
    throw new Error("Employee not found");
  }

  const dateKey = todayDateKey();
  const lists = await prisma.taskList.findMany({
    where: { shopId: shop.id, active: true },
    include: {
      items: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      },
      completions: {
        where: { dateKey },
        select: { taskItemId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: PosTaskListRow[] = [];
  for (const list of lists) {
    const assignedAs = isAssignedToEmployee(list, employee);
    if (!assignedAs) continue;
    if (!matchesLocation(list, employee)) continue;

    const timelines = parseJsonArray(list.timelines).filter(
      (value): value is "DAILY" | "WEEKLY" | "MONTHLY" =>
        value === "DAILY" || value === "WEEKLY" || value === "MONTHLY",
    );
    if (!matchesTab(timelines, params.tab)) continue;

    const completedIds = new Set(list.completions.map((item) => item.taskItemId));
    const taskCount = list.items.length;
    const completedCount = list.items.filter((item) =>
      completedIds.has(item.id),
    ).length;

    rows.push({
      id: list.id,
      name: list.name,
      description: list.description,
      timelines,
      timelineLabels: timelines.map(timelineLabel),
      taskCount,
      completedCount,
      progressLabel: `${completedCount}/${taskCount} done`,
      assignedAs,
    });
  }

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      roleLabel: roleBucket(employee.role) === "manager" ? "Manager" : "Staff",
    },
    tab: params.tab,
    taskLists: rows,
    serverTime: Date.now(),
  };
}
