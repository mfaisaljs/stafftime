export type ClockStatus = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

export type StoredClockState = {
  status: ClockStatus;
  employeeId?: string;
  updatedAt: number;
};

export type StoredVerifySession = {
  employee: { id: string; firstName: string; lastName: string };
  status: {
    employeeId?: string;
    employeeName?: string;
    status: ClockStatus;
    clockInAt?: string;
    clockInAtMs?: number;
    breakStartAt?: string;
    shiftStart?: string;
    shiftEnd?: string;
    serverTime?: number;
    timeFormat?: "24H" | "12H";
    hourFormat?: "STANDARD" | "DECIMAL";
    payrollStats?: {
      hours: number;
      earnings: number;
      hoursLabel: string;
      earningsLabel: string;
    } | null;
  };
  serverTime?: number;
};

export const CLOCK_STATE_STORAGE_KEY = "lastClockState";
export const ACTIVE_SESSION_STORAGE_KEY = "activeVerifySession";

export function subheadingForStatus(status: ClockStatus | null | undefined): string {
  if (status === "CLOCKED_IN") return "Tap to clock out";
  if (status === "ON_BREAK") return "On break - tap to manage";
  return "Tap to clock in";
}

export function isClockStatus(value: unknown): value is ClockStatus {
  return value === "CLOCKED_OUT" || value === "CLOCKED_IN" || value === "ON_BREAK";
}

export function parseStoredClockState(value: unknown): StoredClockState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredClockState>;
  if (!isClockStatus(record.status)) return null;
  return {
    status: record.status,
    employeeId: typeof record.employeeId === "string" ? record.employeeId : undefined,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
}

export function buildClockState(
  status: ClockStatus,
  employeeId?: string,
): StoredClockState {
  return {
    status,
    employeeId,
    updatedAt: Date.now(),
  };
}

export function parseStoredVerifySession(value: unknown): StoredVerifySession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredVerifySession>;
  const employee = record.employee;
  const status = record.status;
  if (
    !employee ||
    typeof employee !== "object" ||
    typeof employee.id !== "string" ||
    typeof employee.firstName !== "string" ||
    typeof employee.lastName !== "string" ||
    !status ||
    typeof status !== "object" ||
    !isClockStatus(status.status)
  ) {
    return null;
  }
  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
    },
    status: {
      ...status,
      status: status.status,
    },
    serverTime:
      typeof record.serverTime === "number" ? record.serverTime : undefined,
  };
}
