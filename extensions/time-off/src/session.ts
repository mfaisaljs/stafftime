export type TimeOffEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel?: string;
  canApprove?: boolean;
};

export type TimeOffTab = "mine" | "staff" | "approvals";

export type TimeOffPolicyOption = {
  id: string;
  name: string;
  compensation: string;
  policyType: string;
};

export type TimeOffRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  policyId: string;
  policyName: string;
  compensation: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  statusLabel: string;
  tone: "warning" | "success" | "critical" | "neutral";
  createdAt: string;
  overlappingShiftCount?: number;
  overlappingShifts?: Array<{
    id: string;
    dateKey: string;
    startTime: string;
    endTime: string;
    locationName: string;
  }>;
  canReview?: boolean;
};

export type StaffOption = {
  id: string;
  name: string;
  roleLabel: string;
};

export type TimeOffBootstrap = {
  employee: TimeOffEmployee & {
    role?: string;
    canApprove: boolean;
  };
  policies: TimeOffPolicyOption[];
  myRequests: TimeOffRequestRow[];
  staff: StaffOption[];
  pendingApprovals: TimeOffRequestRow[];
  approvedApprovals: TimeOffRequestRow[];
  declinedApprovals: TimeOffRequestRow[];
  serverTime?: number;
};

export type StoredTimeOffSession = {
  employee: TimeOffEmployee;
};

export type VerifyResponse = {
  employee: TimeOffEmployee;
  status?: unknown;
  serverTime?: number;
};

export const ACTIVE_SESSION_STORAGE_KEY = "timeOffSession";

export function parseStoredTimeOffSession(
  value: unknown,
): StoredTimeOffSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredTimeOffSession>;
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
      canApprove:
        typeof employee.canApprove === "boolean"
          ? employee.canApprove
          : undefined,
    },
  };
}

export function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
