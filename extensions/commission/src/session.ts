export type CommissionEmployee = {
  id: string;
  firstName: string;
  lastName: string;
};

export type CommissionLineBreakdown = {
  title: string;
  quantity: number;
  productId: string | null;
  programId: string;
  programName: string;
  commissionType: "fixed" | "percentage";
  rate: number;
  baseAmount: number;
  commissionAmount: number;
};

export type AvailableCommissionProgram = {
  id: string;
  name: string;
  productScope: "all" | "specific";
  estimatedTotal: number;
  commissionLabel: string;
  lineCount: number;
};

export type CommissionOrderAttribution = {
  orderId: string;
  orderName: string;
  currency: string;
  orderFinancialStatus?: string;
  attributed: boolean;
  attributedTo: CommissionEmployee | null;
  commissionTotal: number;
  commissionLabel: string;
  programNames: string[];
  lines: CommissionLineBreakdown[];
  availablePrograms: AvailableCommissionProgram[];
  allowMultiSelect: boolean;
  selectedProgramIds: string[];
  eligible: boolean;
  message: string | null;
};

export type StoredCommissionSession = {
  employee: CommissionEmployee;
};

export type VerifyResponse = {
  employee: CommissionEmployee;
  status?: unknown;
  serverTime?: number;
};

export const ACTIVE_SESSION_STORAGE_KEY = "commissionSession";

export function parseStoredCommissionSession(
  value: unknown,
): StoredCommissionSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredCommissionSession>;
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
