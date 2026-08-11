export type ProfileEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel?: string;
};

export type StaffProfileTab = "overview" | "shifts" | "payroll";

export type ProfileShiftRow = {
  id: string;
  dateLabel: string;
  timeRangeLabel: string;
  locationName: string;
  isToday: boolean;
  badge: string;
  tone: "info" | "neutral" | "success" | "warning";
  startsAt: string;
  endsAt: string;
};

export type StaffProfileResponse = {
  employee: ProfileEmployee & {
    role?: string;
    position?: string | null;
    locationName?: string | null;
  };
  range: { start: string; end: string; days: number };
  overview: {
    totalHours: string;
    workingHours: string;
    breakTime: string;
    absentDays: number;
    baseEarnings: string;
    salaryAdjustment: string;
    totalCommission: string;
    totalBonus: string;
    totalEarnings: string;
    paidAmount: string;
    remainingAmount: string;
  };
  payroll: {
    baseEarnings: string;
    salaryAdjustment: string;
    commission: string;
    totalBonus: string;
    totalEarnings: string;
    paidAmount: string;
    remainingAmount: string;
    unpaidSalary: string;
    unpaidCommission: string;
  };
  shifts: {
    upcoming: ProfileShiftRow[];
    past: ProfileShiftRow[];
  };
  serverTime?: number;
};

export type StoredProfileSession = {
  employee: ProfileEmployee;
};

export type VerifyResponse = {
  employee: ProfileEmployee;
  status?: unknown;
  serverTime?: number;
};

export const ACTIVE_SESSION_STORAGE_KEY = "staffProfileSession";

export function parseStoredProfileSession(
  value: unknown,
): StoredProfileSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredProfileSession>;
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

export function toDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeForDays(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: toDateKey(start), end: toDateKey(end), days };
}
