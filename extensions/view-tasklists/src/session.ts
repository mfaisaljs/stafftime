export type TaskEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel?: string;
};

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

export type StoredTaskSession = {
  employee: TaskEmployee;
};

export type VerifyResponse = {
  employee: TaskEmployee;
  status?: unknown;
  serverTime?: number;
};

export type TaskListsResponse = {
  employee: TaskEmployee & { role?: string; roleLabel?: string };
  tab: PosTaskListTab;
  taskLists: PosTaskListRow[];
  serverTime?: number;
};

export const ACTIVE_SESSION_STORAGE_KEY = "viewTasklistsSession";

export function parseStoredTaskSession(
  value: unknown,
): StoredTaskSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredTaskSession>;
  const employee = record.employee;
  if (
    !employee ||
    typeof employee !== "object" ||
    typeof employee.id !== "string" ||
    typeof employee.firstName !== "string" ||
    typeof employee.lastName !== "string"
  ) {
    return null;
  }
  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      roleLabel:
        typeof employee.roleLabel === "string"
          ? employee.roleLabel
          : undefined,
    },
  };
}
