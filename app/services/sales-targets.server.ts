import prisma from "../db.server";
import { ensureShop } from "./workforce.server";

export type SalesTargetStatus = "Met" | "On track" | "Behind";

export type EmployeeSalesTargetProgress = {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
  };
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

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function currentYearMonth(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function formatSalesMoney(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

export function computeSalesTargetProgress(sold: number, goalAmount: number) {
  const remainingAmount = Math.max(0, goalAmount - sold);
  const progressPercent =
    goalAmount > 0 ? Math.min(100, Math.round((sold / goalAmount) * 100)) : 0;
  const status: SalesTargetStatus =
    progressPercent >= 100
      ? "Met"
      : progressPercent >= 50
        ? "On track"
        : "Behind";
  const statusTone: "success" | "info" | "warning" =
    status === "Met" ? "success" : status === "On track" ? "info" : "warning";

  return { remainingAmount, progressPercent, status, statusTone };
}

function monthLabel(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export async function getEmployeeSalesTargetForPos(params: {
  shopDomain: string;
  employeeId: string;
}): Promise<EmployeeSalesTargetProgress> {
  const shop = await ensureShop(params.shopDomain);
  const employee = await prisma.employee.findFirst({
    where: {
      id: params.employeeId,
      shopId: shop.id,
      status: { not: "ARCHIVED" },
    },
  });
  if (!employee) {
    throw new Error("Employee not found");
  }

  const yearMonth = currentYearMonth();
  const targets = await prisma.salesTarget.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });

  const assigned = targets.find((target) =>
    parseIds(target.employeeIds).includes(employee.id),
  );

  if (!assigned) {
    return {
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
      yearMonth,
      monthLabel: monthLabel(yearMonth),
      hasTarget: false,
      currency: "USD",
      goalAmount: 0,
      soldAmount: 0,
      remainingAmount: 0,
      progressPercent: 0,
      status: "Behind",
      statusTone: "warning",
      soldLabel: formatSalesMoney("USD", 0),
      goalLabel: formatSalesMoney("USD", 0),
      remainingLabel: formatSalesMoney("USD", 0),
      progressLabel: "0%",
    };
  }

  const snapshot = await prisma.salesTargetSnapshot.upsert({
    where: {
      shopId_employeeId_yearMonth: {
        shopId: shop.id,
        employeeId: employee.id,
        yearMonth,
      },
    },
    create: {
      shopId: shop.id,
      employeeId: employee.id,
      yearMonth,
      amount: assigned.amount,
      currency: assigned.currency,
      soldAmount: 0,
    },
    update: {
      amount: assigned.amount,
      currency: assigned.currency,
    },
  });

  const soldAmount = snapshot.soldAmount ?? 0;
  const goalAmount = snapshot.amount ?? assigned.amount;
  const currency = snapshot.currency || assigned.currency || "USD";
  const { remainingAmount, progressPercent, status, statusTone } =
    computeSalesTargetProgress(soldAmount, goalAmount);

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
    },
    yearMonth,
    monthLabel: monthLabel(yearMonth),
    hasTarget: true,
    currency,
    goalAmount,
    soldAmount,
    remainingAmount,
    progressPercent,
    status,
    statusTone,
    soldLabel: formatSalesMoney(currency, soldAmount),
    goalLabel: formatSalesMoney(currency, goalAmount),
    remainingLabel: formatSalesMoney(currency, remainingAmount),
    progressLabel: `${progressPercent}%`,
  };
}
