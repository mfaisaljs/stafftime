import type { Employee, EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop } from "./workforce.server";
import { isManagerRole } from "./settings.server";

export type PosTaskListTab = "all" | "daily" | "weekly" | "monthly";

export type PosTaskItemRow = {
  id: string;
  title: string;
  completed: boolean;
  performedBy: string | null;
};

export type PosTaskListRow = {
  id: string;
  name: string;
  description: string | null;
  timelines: Array<"DAILY" | "WEEKLY" | "MONTHLY">;
  timelineLabels: string[];
  timelineLabel: string;
  taskCount: number;
  completedCount: number;
  progressLabel: string;
  assignedAs: "Staff" | "Manager";
  items: PosTaskItemRow[];
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
  switch (value.toUpperCase()) {
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

function normalizeTimelines(raw: string): Array<"DAILY" | "WEEKLY" | "MONTHLY"> {
  return parseJsonArray(raw)
    .map((value) => value.toUpperCase())
    .filter(
      (value): value is "DAILY" | "WEEKLY" | "MONTHLY" =>
        value === "DAILY" || value === "WEEKLY" || value === "MONTHLY",
    );
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

function matchesTab(timelines: string[], tab: PosTaskListTab) {
  if (tab === "all") return true;
  return timelines.includes(tab.toUpperCase());
}

async function getAssignedEmployee(params: {
  shopDomain: string;
  employeeId: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: shop.id },
  });
  if (!employee) {
    throw new Error("Employee not found");
  }
  return { shop, employee };
}

function performerLabel(employee: Employee) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export async function listEmployeeTaskListsForPos(params: {
  shopDomain: string;
  employeeId: string;
  tab: PosTaskListTab;
}) {
  const { shop, employee } = await getAssignedEmployee(params);
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
        select: { taskItemId: true, performedBy: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: PosTaskListRow[] = [];
  for (const list of lists) {
    const assignedAs = isAssignedToEmployee(list, employee);
    if (!assignedAs) continue;
    if (!matchesLocation(list, employee)) continue;

    const timelines = normalizeTimelines(list.timelines);
    if (!matchesTab(timelines, params.tab)) continue;

    const completionByItem = new Map(
      list.completions.map((item) => [item.taskItemId, item.performedBy]),
    );
    const items: PosTaskItemRow[] = list.items.map((item) => ({
      id: item.id,
      title: item.title,
      completed: completionByItem.has(item.id),
      performedBy: completionByItem.get(item.id) ?? null,
    }));
    const taskCount = items.length;
    const completedCount = items.filter((item) => item.completed).length;
    const labels = timelines.map(timelineLabel);

    rows.push({
      id: list.id,
      name: list.name,
      description: list.description,
      timelines,
      timelineLabels: labels,
      timelineLabel: labels[0] ?? "—",
      taskCount,
      completedCount,
      progressLabel: `${completedCount}/${taskCount} done`,
      assignedAs,
      items,
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
    dateKey,
    taskLists: rows,
    serverTime: Date.now(),
  };
}

export async function setPosTaskItemCompletion(params: {
  shopDomain: string;
  employeeId: string;
  taskListId: string;
  taskItemId: string;
  completed: boolean;
}) {
  const { shop, employee } = await getAssignedEmployee(params);
  const list = await prisma.taskList.findFirst({
    where: {
      id: params.taskListId,
      shopId: shop.id,
      active: true,
    },
    include: {
      items: {
        where: { id: params.taskItemId, active: true },
        take: 1,
      },
    },
  });

  if (!list || list.items.length === 0) {
    throw new Error("Task not found");
  }

  const assignedAs = isAssignedToEmployee(list, employee);
  if (!assignedAs) {
    throw new Error("This task list is not assigned to you");
  }
  if (!matchesLocation(list, employee)) {
    throw new Error("This task list is not available at your location");
  }

  const dateKey = todayDateKey();
  const performedBy = performerLabel(employee);

  if (params.completed) {
    await prisma.taskListCompletion.upsert({
      where: {
        taskItemId_dateKey: {
          taskItemId: params.taskItemId,
          dateKey,
        },
      },
      create: {
        shopId: shop.id,
        taskListId: list.id,
        taskItemId: params.taskItemId,
        dateKey,
        performedBy,
        performedAt: new Date(),
        notes: null,
      },
      update: {
        performedBy,
        performedAt: new Date(),
      },
    });
  } else {
    await prisma.taskListCompletion.deleteMany({
      where: {
        shopId: shop.id,
        taskItemId: params.taskItemId,
        dateKey,
      },
    });
  }

  return {
    ok: true as const,
    dateKey,
    taskListId: list.id,
    taskItemId: params.taskItemId,
    completed: params.completed,
    performedBy: params.completed ? performedBy : null,
  };
}
