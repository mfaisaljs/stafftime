export type ShiftEmployee = {
  id: string;
  firstName: string;
  lastName: string;
};

export type PosShiftRow = {
  id: string;
  dateLabel: string;
  dayLabel: string;
  timeRangeLabel: string;
  status: "IN_PROGRESS" | "UPCOMING" | "COMPLETED";
  statusLabel: string;
  tone: "warning" | "info" | "neutral";
  startsAt: string;
  endsAt: string;
  locationName: string;
};

export type PosShiftRange = "upcoming" | "today" | "week" | "month";

export type StoredShiftSession = {
  employee: ShiftEmployee;
};

export type VerifyResponse = {
  employee: ShiftEmployee;
  status?: unknown;
  serverTime?: number;
};

export type ShiftsResponse = {
  employee: ShiftEmployee;
  range: PosShiftRange;
  shifts: PosShiftRow[];
  serverTime?: number;
};

export const ACTIVE_SESSION_STORAGE_KEY = "viewShiftsSession";

export function parseStoredShiftSession(
  value: unknown,
): StoredShiftSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredShiftSession>;
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
    },
  };
}
