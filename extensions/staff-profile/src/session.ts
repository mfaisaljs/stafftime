export type ProfileEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  titlePrefix?: string;
};

export type StaffProfile = {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    titlePrefix: string;
    roleLabel: string;
    position: string;
    department: string;
    email: string;
    phone: string;
    statusLabel: string;
    locationName: string;
  };
  clockStatus: "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";
  clockStatusLabel: string;
  todayShift: {
    timeRangeLabel: string;
  } | null;
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
      fullName:
        typeof employee.fullName === "string" ? employee.fullName : undefined,
      titlePrefix:
        typeof employee.titlePrefix === "string"
          ? employee.titlePrefix
          : undefined,
    },
  };
}

export function pageTitleForEmployee(employee: ProfileEmployee) {
  const prefix =
    employee.titlePrefix ||
    (employee.firstName.endsWith("s") || employee.firstName.endsWith("S")
      ? `${employee.firstName}'`
      : `${employee.firstName}'s`);
  return `${prefix} Profile`;
}
