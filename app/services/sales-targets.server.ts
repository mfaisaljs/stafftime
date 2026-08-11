import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { shopFromDest } from "../utils/http.server";
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

export type SalesTargetOrderAttribution = {
  orderId: string;
  orderName: string;
  amount: number;
  currency: string;
  amountLabel: string;
  attributed: boolean;
  attributedTo: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

function toOrderGid(orderId: string | number) {
  const raw = String(orderId).trim();
  if (raw.startsWith("gid://")) return raw;
  return `gid://shopify/Order/${raw}`;
}

async function fetchShopifyOrderTotals(params: {
  shopDomain: string;
  orderId: string | number;
}) {
  const shop = shopFromDest(params.shopDomain);
  const { admin } = await unauthenticated.admin(shop);
  const orderGid = toOrderGid(params.orderId);

  const response = await admin.graphql(
    `#graphql
      query SalesTargetOrder($id: ID!) {
        order(id: $id) {
          id
          name
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }`,
    { variables: { id: orderGid } },
  );

  const json = (await response.json()) as {
    data?: {
      order?: {
        id: string;
        name: string;
        currentTotalPriceSet?: {
          shopMoney?: { amount?: string; currencyCode?: string };
        } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    const message = json.errors[0]?.message || "Could not load order";
    if (/access denied/i.test(message) || /read_orders/i.test(message)) {
      throw new Error(
        "Order access denied. Enable Protected customer data (Orders) for this app in Partner Dashboard → API access requests, then reinstall/re-auth the app on the store.",
      );
    }
    throw new Error(message);
  }

  const order = json.data?.order;
  if (!order) {
    throw new Error("Order not found");
  }

  const amount = Number(order.currentTotalPriceSet?.shopMoney?.amount ?? NaN);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Order total is unavailable");
  }

  return {
    orderId: String(params.orderId).replace(/^gid:\/\/shopify\/Order\//i, ""),
    orderGid: order.id,
    orderName: order.name,
    amount,
    currency: order.currentTotalPriceSet?.shopMoney?.currencyCode || "USD",
  };
}

export async function getSalesTargetOrderAttribution(params: {
  shopDomain: string;
  orderId: string | number;
}): Promise<SalesTargetOrderAttribution> {
  const shop = await ensureShop(params.shopDomain);
  const orderId = String(params.orderId).replace(
    /^gid:\/\/shopify\/Order\//i,
    "",
  );

  const [order, existing] = await Promise.all([
    fetchShopifyOrderTotals({
      shopDomain: params.shopDomain,
      orderId,
    }),
    prisma.salesTargetAttribution.findUnique({
      where: {
        shopId_orderId: { shopId: shop.id, orderId },
      },
    }),
  ]);

  let attributedTo: SalesTargetOrderAttribution["attributedTo"] = null;
  if (existing) {
    const employee = await prisma.employee.findFirst({
      where: { id: existing.employeeId, shopId: shop.id },
      select: { id: true, firstName: true, lastName: true },
    });
    if (employee) {
      attributedTo = employee;
    }
  }

  return {
    orderId: order.orderId,
    orderName: order.orderName,
    amount: existing?.amount ?? order.amount,
    currency: existing?.currency ?? order.currency,
    amountLabel: formatSalesMoney(
      existing?.currency ?? order.currency,
      existing?.amount ?? order.amount,
    ),
    attributed: Boolean(existing),
    attributedTo,
  };
}

export async function attributeOrderToSalesTarget(params: {
  shopDomain: string;
  employeeId: string;
  orderId: string | number;
}): Promise<SalesTargetOrderAttribution & { progress: EmployeeSalesTargetProgress }> {
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
    throw new Error("No sales target is assigned to this staff member");
  }

  const orderId = String(params.orderId).replace(
    /^gid:\/\/shopify\/Order\//i,
    "",
  );

  const existing = await prisma.salesTargetAttribution.findUnique({
    where: {
      shopId_orderId: { shopId: shop.id, orderId },
    },
  });
  if (existing) {
    throw new Error("This order is already attributed");
  }

  const order = await fetchShopifyOrderTotals({
    shopDomain: params.shopDomain,
    orderId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.salesTargetAttribution.create({
      data: {
        shopId: shop.id,
        employeeId: employee.id,
        orderId,
        orderName: order.orderName,
        amount: order.amount,
        currency: order.currency,
        yearMonth,
      },
    });

    await tx.salesTargetSnapshot.upsert({
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
        soldAmount: order.amount,
      },
      update: {
        amount: assigned.amount,
        currency: assigned.currency,
        soldAmount: { increment: order.amount },
      },
    });
  });

  const progress = await getEmployeeSalesTargetForPos({
    shopDomain: params.shopDomain,
    employeeId: employee.id,
  });

  return {
    orderId,
    orderName: order.orderName,
    amount: order.amount,
    currency: order.currency,
    amountLabel: formatSalesMoney(order.currency, order.amount),
    attributed: true,
    attributedTo: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
    },
    progress,
  };
}
