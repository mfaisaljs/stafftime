import type { Employee, EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop } from "./workforce.server";
import { isManagerRole } from "./settings.server";

export type PosTaskListTab = "all" | "daily" | "weekly" | "monthly";
export type TaskTimeline = "DAILY" | "WEEKLY" | "MONTHLY";

export const SHARED_ASSIGNEE_KEY = "";

export type PosTaskItemRow = {
  id: string;
  title: string;
  shared: boolean;
  completed: boolean;
  performedBy: string | null;
};

export type TaskListAssignment = {
  shopId: string;
  assignStaff: boolean;
  assignManagers: boolean;
  staffScope: string;
  managerScope: string;
  employeeIds: string;
  managerIds: string;
  locationAccess: string;
  locationIds: string;
};

export type AdminAssigneeStatus = {
  employeeId: string;
  name: string;
  status: "completed" | "pending";
  performedBy: string | null;
  performedAt: string | null;
};

export type AdminTaskStatusRow = {
  id: string;
  title: string;
  shared: boolean;
  status: "completed" | "pending";
  performedBy: string | null;
  performedAt: string | null;
  notes: string | null;
  completedCount: number;
  assigneeCount: number;
  assignees: AdminAssigneeStatus[];
};

export type PosTaskListRow = {
  id: string;
  name: string;
  description: string | null;
  timelines: TaskTimeline[];
  timelineLabels: string[];
  timelineLabel: string;
  periodKey: string;
  periodLabel: string;
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

export function toDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Sunday-start local week (matches schedule week helpers). */
export function startOfLocalWeek(value = new Date()) {
  const date = startOfLocalDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function startOfLocalMonth(value = new Date()) {
  const date = startOfLocalDay(value);
  date.setDate(1);
  return date;
}

export function endOfLocalWeek(value = new Date()) {
  const start = startOfLocalWeek(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function endOfLocalMonth(value = new Date()) {
  const start = startOfLocalMonth(value);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setMilliseconds(-1);
  return end;
}

/**
 * Completion bucket for a timeline:
 * - DAILY → that calendar day
 * - WEEKLY → Sunday of that week
 * - MONTHLY → 1st of that month
 */
export function periodKeyForTimeline(
  timeline: string | null | undefined,
  at = new Date(),
): string {
  const kind = String(timeline ?? "DAILY").toUpperCase();
  if (kind === "WEEKLY") return toDateKey(startOfLocalWeek(at));
  if (kind === "MONTHLY") return toDateKey(startOfLocalMonth(at));
  return toDateKey(at);
}

export function currentPeriodKeys(at = new Date()) {
  return {
    DAILY: periodKeyForTimeline("DAILY", at),
    WEEKLY: periodKeyForTimeline("WEEKLY", at),
    MONTHLY: periodKeyForTimeline("MONTHLY", at),
  } as const;
}

export function periodLabelForTimeline(
  timeline: string | null | undefined,
  at = new Date(),
): string {
  const kind = String(timeline ?? "DAILY").toUpperCase();
  if (kind === "WEEKLY") {
    const start = startOfLocalWeek(at);
    const end = endOfLocalWeek(at);
    return `Week of ${start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} – ${end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  }
  if (kind === "MONTHLY") {
    return startOfLocalMonth(at).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }
  return at.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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

export function normalizeTimelines(raw: string): TaskTimeline[] {
  return parseJsonArray(raw)
    .map((value) => value.toUpperCase())
    .filter(
      (value): value is TaskTimeline =>
        value === "DAILY" || value === "WEEKLY" || value === "MONTHLY",
    );
}

function primaryTimeline(timelines: TaskTimeline[]): TaskTimeline {
  return timelines[0] ?? "DAILY";
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

export function assigneeKeyFor(shared: boolean, employeeId?: string | null) {
  if (shared) return SHARED_ASSIGNEE_KEY;
  return employeeId ?? SHARED_ASSIGNEE_KEY;
}

export function isTaskCompletedForViewer(params: {
  shared: boolean;
  viewerEmployeeId: string;
  completions: Array<{ assigneeKey: string }>;
}) {
  if (params.shared) {
    return params.completions.some(
      (completion) => completion.assigneeKey === SHARED_ASSIGNEE_KEY,
    );
  }
  return params.completions.some(
    (completion) => completion.assigneeKey === params.viewerEmployeeId,
  );
}

export function filterAssignedEmployees<T extends Employee>(
  list: Omit<TaskListAssignment, "shopId">,
  employees: T[],
): T[] {
  return employees.filter((employee) => {
    if (employee.status !== "ACTIVE") return false;
    if (!isAssignedToEmployee(list, employee)) return false;
    return matchesLocation(list, employee);
  });
}

export async function listAssignedEmployees(list: TaskListAssignment) {
  const employees = await prisma.employee.findMany({
    where: { shopId: list.shopId, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return filterAssignedEmployees(list, employees);
}

export function buildAdminTaskStatusRows(params: {
  items: Array<{
    id: string;
    title: string;
    shared: boolean;
  }>;
  assignedEmployees: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
  completions: Array<{
    taskItemId: string;
    assigneeKey: string;
    performedBy: string | null;
    performedAt: Date;
    notes: string | null;
  }>;
}): AdminTaskStatusRow[] {
  const assigned = params.assignedEmployees.map((employee) => ({
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
  }));

  return params.items.map((item) => {
    const itemCompletions = params.completions
      .filter((completion) => completion.taskItemId === item.id)
      .slice()
      .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());

    if (item.shared) {
      const sharedCompletion = itemCompletions.find(
        (completion) => completion.assigneeKey === SHARED_ASSIGNEE_KEY,
      );
      return {
        id: item.id,
        title: item.title,
        shared: true,
        status: sharedCompletion ? ("completed" as const) : ("pending" as const),
        performedBy: sharedCompletion?.performedBy ?? null,
        performedAt: sharedCompletion?.performedAt?.toISOString() ?? null,
        notes: sharedCompletion?.notes ?? null,
        completedCount: sharedCompletion ? 1 : 0,
        assigneeCount: 1,
        assignees: [],
      };
    }

    const completionByAssignee = new Map(
      itemCompletions.map((completion) => [completion.assigneeKey, completion]),
    );
    const assignees: AdminAssigneeStatus[] = assigned.map((employee) => {
      const completion = completionByAssignee.get(employee.id);
      return {
        employeeId: employee.id,
        name: employee.name,
        status: completion ? ("completed" as const) : ("pending" as const),
        performedBy: completion?.performedBy ?? null,
        performedAt: completion?.performedAt?.toISOString() ?? null,
      };
    });
    const completedCount = assignees.filter(
      (assignee) => assignee.status === "completed",
    ).length;
    const fullyDone =
      assigned.length > 0 && completedCount === assigned.length;
    const latestCompletion = itemCompletions[0] ?? null;

    return {
      id: item.id,
      title: item.title,
      shared: false,
      status: fullyDone ? ("completed" as const) : ("pending" as const),
      performedBy:
        assigned.length > 0 ? `${completedCount} of ${assigned.length}` : null,
      performedAt: latestCompletion?.performedAt?.toISOString() ?? null,
      notes: latestCompletion?.notes ?? null,
      completedCount,
      assigneeCount: assigned.length,
      assignees,
    };
  });
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
  const now = new Date();
  const periodKeys = currentPeriodKeys(now);
  const periodKeyList = [
    periodKeys.DAILY,
    periodKeys.WEEKLY,
    periodKeys.MONTHLY,
  ];

  const lists = await prisma.taskList.findMany({
    where: { shopId: shop.id, active: true },
    include: {
      items: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      },
      completions: {
        where: { dateKey: { in: periodKeyList } },
        select: {
          taskItemId: true,
          performedBy: true,
          dateKey: true,
          assigneeKey: true,
        },
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

    const timeline = primaryTimeline(timelines);
    const periodKey = periodKeys[timeline];
    const periodLabel = periodLabelForTimeline(timeline, now);

    const periodCompletions = list.completions.filter(
      (completion) => completion.dateKey === periodKey,
    );
    const items: PosTaskItemRow[] = list.items.map((item) => {
      const itemCompletions = periodCompletions.filter(
        (completion) => completion.taskItemId === item.id,
      );
      const completed = isTaskCompletedForViewer({
        shared: item.shared,
        viewerEmployeeId: employee.id,
        completions: itemCompletions,
      });
      const viewerCompletion = item.shared
        ? itemCompletions.find(
            (completion) => completion.assigneeKey === SHARED_ASSIGNEE_KEY,
          )
        : itemCompletions.find(
            (completion) => completion.assigneeKey === employee.id,
          );
      return {
        id: item.id,
        title: item.title,
        shared: item.shared,
        completed,
        performedBy: viewerCompletion?.performedBy ?? null,
      };
    });
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
      periodKey,
      periodLabel,
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
    periodKeys,
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

  const item = list.items[0];
  const timeline = primaryTimeline(normalizeTimelines(list.timelines));
  const dateKey = periodKeyForTimeline(timeline);
  const performedBy = performerLabel(employee);
  const assigneeKey = assigneeKeyFor(item.shared, employee.id);

  if (params.completed) {
    await prisma.taskListCompletion.upsert({
      where: {
        taskItemId_dateKey_assigneeKey: {
          taskItemId: params.taskItemId,
          dateKey,
          assigneeKey,
        },
      },
      create: {
        shopId: shop.id,
        taskListId: list.id,
        taskItemId: params.taskItemId,
        dateKey,
        assigneeKey,
        employeeId: employee.id,
        performedBy,
        performedAt: new Date(),
        notes: null,
      },
      update: {
        employeeId: employee.id,
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
        assigneeKey,
      },
    });
  }

  return {
    ok: true as const,
    dateKey,
    timeline,
    periodLabel: periodLabelForTimeline(timeline),
    taskListId: list.id,
    taskItemId: params.taskItemId,
    completed: params.completed,
    performedBy: params.completed ? performedBy : null,
  };
}

export async function setAdminTaskShared(params: {
  shopId: string;
  taskListId: string;
  taskItemId: string;
  shared: boolean;
}) {
  const item = await prisma.taskListItem.findFirst({
    where: {
      id: params.taskItemId,
      taskListId: params.taskListId,
      taskList: { shopId: params.shopId },
    },
    select: { id: true },
  });
  if (!item) {
    throw new Error("Task not found");
  }

  await prisma.taskListItem.update({
    where: { id: item.id },
    data: { shared: params.shared },
  });

  return { ok: true as const, shared: params.shared };
}

export async function setAdminTaskItemCompletion(params: {
  shopId: string;
  taskListId: string;
  taskItemId: string;
  dateKey: string;
  employeeId?: string | null;
  completeAllRemaining?: boolean;
}) {
  const list = await prisma.taskList.findFirst({
    where: { id: params.taskListId, shopId: params.shopId },
    include: {
      items: { where: { id: params.taskItemId }, take: 1 },
    },
  });
  if (!list || list.items.length === 0) {
    throw new Error("Task not found");
  }

  const item = list.items[0];
  const timeline = primaryTimeline(normalizeTimelines(list.timelines));
  const dateKey = periodKeyForTimeline(timeline, dateFromKey(params.dateKey));
  const now = new Date();

  if (item.shared) {
    await prisma.taskListCompletion.upsert({
      where: {
        taskItemId_dateKey_assigneeKey: {
          taskItemId: item.id,
          dateKey,
          assigneeKey: SHARED_ASSIGNEE_KEY,
        },
      },
      create: {
        shopId: params.shopId,
        taskListId: list.id,
        taskItemId: item.id,
        dateKey,
        assigneeKey: SHARED_ASSIGNEE_KEY,
        employeeId: null,
        performedBy: "Admin",
        performedAt: now,
        notes: null,
      },
      update: {
        performedBy: "Admin",
        performedAt: now,
      },
    });
    return { ok: true as const, dateKey };
  }

  const assigned = await listAssignedEmployees(list);
  const targets = params.completeAllRemaining
    ? assigned
    : assigned.filter((employee) => employee.id === params.employeeId);

  if (targets.length === 0) {
    throw new Error("No assigned staff to complete");
  }

  const existing = await prisma.taskListCompletion.findMany({
    where: {
      shopId: params.shopId,
      taskItemId: item.id,
      dateKey,
      assigneeKey: { in: targets.map((employee) => employee.id) },
    },
    select: { assigneeKey: true },
  });
  const alreadyDone = new Set(existing.map((row) => row.assigneeKey));

  await prisma.$transaction(
    targets
      .filter((employee) => !alreadyDone.has(employee.id))
      .map((employee) =>
        prisma.taskListCompletion.create({
          data: {
            shopId: params.shopId,
            taskListId: list.id,
            taskItemId: item.id,
            dateKey,
            assigneeKey: employee.id,
            employeeId: employee.id,
            performedBy: "Admin",
            performedAt: now,
            notes: null,
          },
        }),
      ),
  );

  return { ok: true as const, dateKey };
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}
