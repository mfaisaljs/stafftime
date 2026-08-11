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

export type ProductCommissionRule = { productId: string; commission: string };

export type OrderLineForCommission = {
  title: string;
  quantity: number;
  productId: string | null;
  originalTotal: number;
  discountedTotal: number;
};

export function normalizeProductId(id: string | null | undefined) {
  if (!id) return null;
  const raw = id.trim();
  if (!raw) return null;
  if (raw.startsWith("gid://")) return raw;
  return `gid://shopify/Product/${raw}`;
}

function productIdsMatch(a: string | null, b: string | null) {
  const left = normalizeProductId(a);
  const right = normalizeProductId(b);
  if (!left || !right) return false;
  return left === right;
}

function rateForLine(params: {
  productScope: string;
  allProductsCommission: number | null;
  productCommissions: ProductCommissionRule[];
  productId: string | null;
}): number | null {
  if (params.productScope === "all") {
    const value = params.allProductsCommission;
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return null;
    }
    return Number(value);
  }

  if (!params.productId) return null;
  const match = params.productCommissions.find((rule) =>
    productIdsMatch(rule.productId, params.productId),
  );
  if (!match || !match.commission) return null;
  const rate = Number(match.commission);
  return Number.isFinite(rate) ? rate : null;
}

export function calculateCommissionForPrograms(params: {
  lines: OrderLineForCommission[];
  programs: Array<{
    id: string;
    name: string;
    commissionType: string;
    afterDiscount: boolean;
    productScope: string;
    allProductsCommission: number | null;
    productCommissions: ProductCommissionRule[];
  }>;
}) {
  const breakdown: CommissionLineBreakdown[] = [];
  let commissionTotal = 0;

  for (const program of params.programs) {
    const commissionType =
      program.commissionType === "percentage" ? "percentage" : "fixed";

    for (const line of params.lines) {
      const rate = rateForLine({
        productScope: program.productScope,
        allProductsCommission: program.allProductsCommission,
        productCommissions: program.productCommissions,
        productId: line.productId,
      });
      if (rate === null) continue;

      const baseAmount = program.afterDiscount
        ? line.discountedTotal
        : line.originalTotal;
      const commissionAmount =
        commissionType === "percentage"
          ? (baseAmount * rate) / 100
          : rate * line.quantity;

      if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) continue;

      commissionTotal += commissionAmount;
      breakdown.push({
        title: line.title,
        quantity: line.quantity,
        productId: line.productId,
        programId: program.id,
        programName: program.name,
        commissionType,
        rate,
        baseAmount,
        commissionAmount: Number(commissionAmount.toFixed(2)),
      });
    }
  }

  return {
    commissionTotal: Number(commissionTotal.toFixed(2)),
    lines: breakdown,
    programIds: Array.from(new Set(breakdown.map((line) => line.programId))),
    programNames: Array.from(new Set(breakdown.map((line) => line.programName))),
  };
}
