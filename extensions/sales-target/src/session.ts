export type SalesTargetEmployee = {
  id: string;
  firstName: string;
  lastName: string;
};

export type SalesTargetStatus = "Met" | "On track" | "Behind";

export type SalesTargetProgress = {
  employee: SalesTargetEmployee;
  yearMonth: string;
  monthLabel: string;
  hasTarget: boolean;
  currency: string;
  goalAmount: number;
  soldAmount: number;
  remainingAmount: number;
  progressPercent: number;
  status: SalesTargetStatus;
  statusTone: "success" | "info" | "warning";
  soldLabel: string;
  goalLabel: string;
  remainingLabel: string;
  progressLabel: string;
};

export type StoredSalesTargetSession = {
  employee: SalesTargetEmployee;
};

export type VerifyResponse = {
  employee: SalesTargetEmployee;
  status?: unknown;
  serverTime?: number;
};

export type SalesTargetOrderAttribution = {
  orderId: string;
  orderName: string;
  amount: number;
  currency: string;
  amountLabel: string;
  attributed: boolean;
  attributedTo: SalesTargetEmployee | null;
};

export const ACTIVE_SESSION_STORAGE_KEY = "salesTargetSession";

export function parseStoredSalesTargetSession(
  value: unknown,
): StoredSalesTargetSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredSalesTargetSession>;
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
