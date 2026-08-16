export type ManagerEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel?: string;
};

export type StaffListFilter =
  | "all"
  | "working"
  | "on_break"
  | "on_leave"
  | "absent"
  | "late";

export type DetailTab = "overview" | "shifts" | "payroll";

export type AttendanceStatus =
  | "working"
  | "on_break"
  | "on_leave"
  | "absent"
  | "late"
  | "off";

export type PunchStatus =
  | "CLOCKED_IN"
  | "ON_BREAK"
  | "CLOCKED_OUT"
  | "NOT_STARTED";

export type ManagerStaffRow = {
  id: string;
  name: string;
  position: string;
  location: string;
  status: AttendanceStatus;
  statusLabel: string;
  statusTone: "success" | "warning" | "critical" | "info" | "neutral";
  punchStatus: PunchStatus;
  punchStatusLabel: string;
  punchStatusTone: "success" | "warning" | "critical" | "info" | "neutral";
  clockInLabel: string | null;
  clockOutLabel: string | null;
  isSelf: boolean;
};

export type ManagerMetrics = {
  workingCount: number;
  onBreakCount: number;
  onLeaveCount: number;
  absentCount: number;
  lateCount: number;
  totalCount: number;
};

export type ManagerBootstrap = {
  manager: ManagerEmployee & { role?: string; canAccess: boolean };
  metrics: ManagerMetrics;
  staff: ManagerStaffRow[];
  serverTime?: number;
};

export type ProfileShiftRow = {
  id: string;
  dateLabel: string;
  timeRangeLabel: string;
  locationName: string;
  isToday: boolean;
  badge: string;
  tone: "info" | "neutral" | "success" | "warning" | "critical";
  startsAt: string;
  endsAt: string;
  cancelledForLeave?: boolean;
};

export type StaffProfilePayload = {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    role?: string;
    roleLabel?: string;
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
};

export type ClockStatus = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

export type EmployeeClockStatus = {
  employeeId: string;
  employeeName: string;
  status: ClockStatus;
  dayTotalLabel?: string;
  sessionLabel?: string;
  locationName?: string;
  firstClockInLabel?: string;
  currentClockInLabel?: string;
  history?: Array<{
    id: string;
    label: string;
    atLabel: string;
    badge: string;
    tone: "success" | "critical" | "warning" | "neutral";
  }>;
};

export type ManagerStaffDetail = {
  profile: StaffProfilePayload;
  clockStatus: EmployeeClockStatus;
  details: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    status: string;
    statusLabel: string;
    staffType: string;
    email: string | null;
    phone: string | null;
    position: string | null;
    roleLabel: string;
    hourlyRate: number;
    hourlyRateLabel: string;
    locationName: string | null;
    currency: string;
  };
  serverTime?: number;
};

export type StoredManagerSession = {
  employee: ManagerEmployee;
};

export type VerifyResponse = {
  employee: ManagerEmployee;
  status?: unknown;
  serverTime?: number;
};

export const ACTIVE_SESSION_STORAGE_KEY = "managerViewSession";

export function parseStoredManagerSession(
  value: unknown,
): StoredManagerSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredManagerSession>;
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
