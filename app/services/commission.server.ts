import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { shopFromDest } from "../utils/http.server";
import {
  calculateCommissionForPrograms,
  normalizeProductId,
  type AvailableCommissionProgram,
  type CommissionLineBreakdown,
  type ProductCommissionRule,
} from "./commission-calc";
import { ensureShop } from "./workforce.server";

export type { CommissionLineBreakdown, AvailableCommissionProgram } from "./commission-calc";
export { calculateCommissionForPrograms } from "./commission-calc";

export type CommissionOrderAttribution = {
  orderId: string;
  orderName: string;
  currency: string;
  orderFinancialStatus: string;
  attributed: boolean;
  attributedTo: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
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

type OrderLine = {
  title: string;
  quantity: number;
  productId: string | null;
  originalTotal: number;
  discountedTotal: number;
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

function parseProductCommissions(raw: string): ProductCommissionRule[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { productId?: unknown; commission?: unknown };
        if (typeof record.productId !== "string") return null;
        return {
          productId: record.productId,
          commission: String(record.commission ?? "").trim(),
        };
      })
      .filter((item): item is ProductCommissionRule => Boolean(item));
  } catch {
    return [];
  }
}

function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

function toOrderGid(orderId: string | number) {
  const raw = String(orderId).trim();
  if (raw.startsWith("gid://")) return raw;
  return `gid://shopify/Order/${raw}`;
}

function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function programIsActiveOnDate(params: {
  limitedTime: boolean;
  startDate: string | null;
  endDate: string | null;
  onDate: string;
}) {
  if (!params.limitedTime) return true;
  if (params.startDate && params.onDate < params.startDate) return false;
  if (params.endDate && params.onDate > params.endDate) return false;
  return true;
}

async function fetchShopifyOrderForCommission(params: {
  shopDomain: string;
  orderId: string | number;
}) {
  const shop = shopFromDest(params.shopDomain);
  const { admin } = await unauthenticated.admin(shop);
  const orderGid = toOrderGid(params.orderId);

  const response = await admin.graphql(
    `#graphql
      query CommissionOrder($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          currencyCode
          displayFinancialStatus
          fullyPaid
          lineItems(first: 100) {
            nodes {
              title
              quantity
              product {
                id
              }
              originalTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
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
        createdAt: string;
        currencyCode?: string | null;
        displayFinancialStatus?: string | null;
        fullyPaid?: boolean | null;
        lineItems?: {
          nodes?: Array<{
            title?: string | null;
            quantity?: number | null;
            product?: { id?: string | null } | null;
            originalTotalSet?: {
              shopMoney?: { amount?: string; currencyCode?: string };
            } | null;
            discountedTotalSet?: {
              shopMoney?: { amount?: string; currencyCode?: string };
            } | null;
          } | null>;
        } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "Could not load order");
  }

  const order = json.data?.order;
  if (!order) {
    throw new Error("Order not found");
  }

  const lines: OrderLine[] = (order.lineItems?.nodes ?? [])
    .filter(Boolean)
    .map((node) => {
      const originalTotal = Number(
        node?.originalTotalSet?.shopMoney?.amount ?? 0,
      );
      const discountedTotal = Number(
        node?.discountedTotalSet?.shopMoney?.amount ?? originalTotal,
      );
      return {
        title: String(node?.title || "Item"),
        quantity: Number(node?.quantity || 0),
        productId: normalizeProductId(node?.product?.id ?? null),
        originalTotal: Number.isFinite(originalTotal) ? originalTotal : 0,
        discountedTotal: Number.isFinite(discountedTotal)
          ? discountedTotal
          : 0,
      };
    })
    .filter((line) => line.quantity > 0);

  const financialStatus =
    order.displayFinancialStatus ||
    (order.fullyPaid ? "PAID" : "PENDING");

  return {
    orderId: String(params.orderId).replace(/^gid:\/\/shopify\/Order\//i, ""),
    orderName: order.name,
    createdAt: new Date(order.createdAt),
    currency: order.currencyCode || "USD",
    financialStatus,
    lines,
  };
}

async function getEligibleProgramsForEmployee(params: {
  shopId: string;
  employeeId: string;
  onDate: string;
}) {
  const programs = await prisma.commissionProgram.findMany({
    where: { shopId: params.shopId, active: true },
    orderBy: { createdAt: "desc" },
  });

  return programs
    .filter((program) => parseIds(program.employeeIds).includes(params.employeeId))
    .filter((program) =>
      programIsActiveOnDate({
        limitedTime: program.limitedTime,
        startDate: program.startDate,
        endDate: program.endDate,
        onDate: params.onDate,
      }),
    )
    .map((program) => ({
      id: program.id,
      name: program.name,
      commissionType: program.commissionType,
      afterDiscount: program.afterDiscount,
      productScope: program.productScope,
      allProductsCommission: program.allProductsCommission,
      productCommissions: parseProductCommissions(program.productCommissions),
    }));
}

export async function getCommissionOrderAttribution(params: {
  shopDomain: string;
  orderId: string | number;
  employeeId?: string;
  selectedProgramIds?: string[];
}): Promise<CommissionOrderAttribution> {
  const shop = await ensureShop(params.shopDomain);
  const orderId = String(params.orderId).replace(
    /^gid:\/\/shopify\/Order\//i,
    "",
  );

  const [order, existing] = await Promise.all([
    fetchShopifyOrderForCommission({
      shopDomain: params.shopDomain,
      orderId,
    }),
    prisma.commissionAttribution.findUnique({
      where: { shopId_orderId: { shopId: shop.id, orderId } },
    }),
  ]);

  if (existing) {
    let attributedTo: CommissionOrderAttribution["attributedTo"] = null;
    const employee = await prisma.employee.findFirst({
      where: { id: existing.employeeId, shopId: shop.id },
      select: { id: true, firstName: true, lastName: true },
    });
    if (employee) attributedTo = employee;

    let lines: CommissionLineBreakdown[] = [];
    try {
      lines = JSON.parse(existing.lineItemsJson) as CommissionLineBreakdown[];
    } catch {
      lines = [];
    }

    const programNames = Array.from(
      new Set(lines.map((line) => line.programName).filter(Boolean)),
    );

    return {
      orderId,
      orderName: existing.orderName || order.orderName,
      currency: existing.currency,
      orderFinancialStatus:
        existing.orderFinancialStatus || order.financialStatus || "PAID",
      attributed: true,
      attributedTo,
      commissionTotal: existing.commissionTotal,
      commissionLabel: formatMoney(existing.currency, existing.commissionTotal),
      programNames,
      lines,
      availablePrograms: [],
      allowMultiSelect: false,
      selectedProgramIds: parseIds(existing.programIds),
      eligible: true,
      message: null,
    };
  }

  if (!params.employeeId) {
    return {
      orderId,
      orderName: order.orderName,
      currency: order.currency,
      orderFinancialStatus: order.financialStatus,
      attributed: false,
      attributedTo: null,
      commissionTotal: 0,
      commissionLabel: formatMoney(order.currency, 0),
      programNames: [],
      lines: [],
      availablePrograms: [],
      allowMultiSelect: false,
      selectedProgramIds: [],
      eligible: false,
      message: "Enter PIN to calculate commission for this order.",
    };
  }

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

  const programs = await getEligibleProgramsForEmployee({
    shopId: shop.id,
    employeeId: employee.id,
    onDate: toDateKey(order.createdAt),
  });

  if (programs.length === 0) {
    return {
      orderId,
      orderName: order.orderName,
      currency: order.currency,
      orderFinancialStatus: order.financialStatus,
      attributed: false,
      attributedTo: null,
      commissionTotal: 0,
      commissionLabel: formatMoney(order.currency, 0),
      programNames: [],
      lines: [],
      availablePrograms: [],
      allowMultiSelect: false,
      selectedProgramIds: [],
      eligible: false,
      message: "No active commission program is assigned to this staff member.",
    };
  }

  const selectedProgramIds = (params.selectedProgramIds ?? []).filter(Boolean);
  const calculated = calculateCommissionForPrograms({
    lines: order.lines,
    programs,
    selectedProgramIds,
    currency: order.currency,
  });

  if (calculated.availablePrograms.length === 0) {
    return {
      orderId,
      orderName: order.orderName,
      currency: order.currency,
      orderFinancialStatus: order.financialStatus,
      attributed: false,
      attributedTo: null,
      commissionTotal: 0,
      commissionLabel: formatMoney(order.currency, 0),
      programNames: [],
      lines: [],
      availablePrograms: [],
      allowMultiSelect: false,
      selectedProgramIds: [],
      eligible: false,
      message:
        "No commissionable products on this order match the staff member's program rules.",
    };
  }

  const hasSelection = selectedProgramIds.length > 0;
  const selectionValid =
    !hasSelection ||
    selectedProgramIds.every((id) =>
      calculated.availablePrograms.some((program) => program.id === id),
    );

  return {
    orderId,
    orderName: order.orderName,
    currency: order.currency,
    orderFinancialStatus: order.financialStatus,
    attributed: false,
    attributedTo: null,
    commissionTotal: calculated.commissionTotal,
    commissionLabel: formatMoney(order.currency, calculated.commissionTotal),
    programNames: calculated.programNames,
    lines: calculated.lines,
    availablePrograms: calculated.availablePrograms,
    allowMultiSelect: calculated.allowMultiSelect,
    selectedProgramIds: selectionValid ? selectedProgramIds : [],
    eligible: hasSelection && selectionValid && calculated.commissionTotal > 0,
    message: hasSelection
      ? calculated.commissionTotal > 0
        ? null
        : "Selected programs have no commissionable amount for this order."
      : calculated.allowMultiSelect
        ? "Select one or more programs for this order."
        : "Select a commission program for this order.",
  };
}

export async function attributeOrderToCommission(params: {
  shopDomain: string;
  employeeId: string;
  orderId: string | number;
  programIds: string[];
}): Promise<CommissionOrderAttribution> {
  const shop = await ensureShop(params.shopDomain);
  const orderId = String(params.orderId).replace(
    /^gid:\/\/shopify\/Order\//i,
    "",
  );

  const existing = await prisma.commissionAttribution.findUnique({
    where: { shopId_orderId: { shopId: shop.id, orderId } },
  });
  if (existing) {
    throw new Error("This order is already attributed for commission");
  }

  const programIds = params.programIds.filter(Boolean);
  if (programIds.length === 0) {
    throw new Error("Select at least one commission program");
  }

  const preview = await getCommissionOrderAttribution({
    shopDomain: params.shopDomain,
    orderId,
    employeeId: params.employeeId,
    selectedProgramIds: programIds,
  });

  if (!preview.eligible || preview.commissionTotal <= 0) {
    throw new Error(
      preview.message || "No commissionable amount for this order",
    );
  }

  await prisma.commissionAttribution.create({
    data: {
      shopId: shop.id,
      employeeId: params.employeeId,
      orderId,
      orderName: preview.orderName,
      orderFinancialStatus: preview.orderFinancialStatus || "PAID",
      payoutStatus: "PENDING",
      commissionTotal: preview.commissionTotal,
      currency: preview.currency,
      programIds: JSON.stringify(preview.programIds),
      lineItemsJson: JSON.stringify(preview.lines),
    },
  });

  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: shop.id },
    select: { id: true, firstName: true, lastName: true },
  });

  return {
    ...preview,
    attributed: true,
    attributedTo: employee,
    message: null,
  };
}
