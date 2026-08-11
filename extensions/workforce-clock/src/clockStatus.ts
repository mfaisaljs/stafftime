export type ClockStatus = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

export type StoredClockState = {
  status: ClockStatus;
  employeeId?: string;
  updatedAt: number;
};

export const CLOCK_STATE_STORAGE_KEY = "lastClockState";

export function subheadingForStatus(status: ClockStatus | null | undefined): string {
  if (status === "CLOCKED_IN") return "Tap to clock out";
  if (status === "ON_BREAK") return "On break — tap to manage";
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
