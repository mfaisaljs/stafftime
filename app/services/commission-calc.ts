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

export type CommissionProgramInput = {
  id: string;
  name: string;
  commissionType: string;
  afterDiscount: boolean;
  productScope: string;
  allProductsCommission: number | null;
  productCommissions: ProductCommissionRule[];
};

export type AvailableCommissionProgram = {
  id: string;
  name: string;
  productScope: "all" | "specific";
  estimatedTotal: number;
  commissionLabel: string;
  lineCount: number;
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

function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

function rateForProgramLine(
  program: CommissionProgramInput,
  productId: string | null,
): number | null {
  if (program.productScope === "all") {
    const value = program.allProductsCommission;
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return null;
    }
    return Number(value);
  }

  if (!productId) return null;
  const match = program.productCommissions.find((rule) =>
    productIdsMatch(rule.productId, productId),
  );
  if (!match || !match.commission) return null;
  const rate = Number(match.commission);
  return Number.isFinite(rate) ? rate : null;
}

function lineCommissionAmount(params: {
  program: CommissionProgramInput;
  line: OrderLineForCommission;
  rate: number;
}) {
  const commissionType =
    params.program.commissionType === "percentage" ? "percentage" : "fixed";
  const baseAmount = params.program.afterDiscount
    ? params.line.discountedTotal
    : params.line.originalTotal;
  const commissionAmount =
    commissionType === "percentage"
      ? (baseAmount * params.rate) / 100
      : params.rate * params.line.quantity;

  if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) return null;

  return {
    commissionType: commissionType as "fixed" | "percentage",
    rate: params.rate,
    baseAmount,
    commissionAmount: Number(commissionAmount.toFixed(2)),
  };
}

/**
 * For each line, specific-product programs beat all-product programs.
 * A line is assigned to at most one selected program (first selected match).
 */
export function calculateCommissionForPrograms(params: {
  lines: OrderLineForCommission[];
  programs: CommissionProgramInput[];
  selectedProgramIds?: string[] | null;
  currency?: string;
}) {
  const currency = params.currency || "USD";
  const selectedIds = params.selectedProgramIds?.length
    ? new Set(params.selectedProgramIds)
    : null;

  // Build per-program exclusive line assignments (specific wins over all).
  const programLineMap = new Map<
    string,
    Array<{
      line: OrderLineForCommission;
      program: CommissionProgramInput;
      computed: NonNullable<ReturnType<typeof lineCommissionAmount>>;
    }>
  >();

  for (const program of params.programs) {
    programLineMap.set(program.id, []);
  }

  for (const line of params.lines) {
    const matchingSpecific: Array<{
      program: CommissionProgramInput;
      rate: number;
      computed: NonNullable<ReturnType<typeof lineCommissionAmount>>;
    }> = [];
    const matchingAll: typeof matchingSpecific = [];

    for (const program of params.programs) {
      const rate = rateForProgramLine(program, line.productId);
      if (rate === null) continue;
      const computed = lineCommissionAmount({ program, line, rate });
      if (!computed) continue;
      const entry = { program, rate, computed };
      if (program.productScope === "specific") matchingSpecific.push(entry);
      else if (program.productScope === "all") matchingAll.push(entry);
    }

    // Specific product programs override all-product programs for this line.
    const winners = matchingSpecific.length > 0 ? matchingSpecific : matchingAll;
    for (const winner of winners) {
      programLineMap.get(winner.program.id)?.push({
        line,
        program: winner.program,
        computed: winner.computed,
      });
    }
  }

  const availablePrograms: AvailableCommissionProgram[] = [];
  for (const program of params.programs) {
    const entries = programLineMap.get(program.id) ?? [];
    if (entries.length === 0) continue;
    const estimatedTotal = Number(
      entries
        .reduce((sum, entry) => sum + entry.computed.commissionAmount, 0)
        .toFixed(2),
    );
    if (estimatedTotal <= 0) continue;
    availablePrograms.push({
      id: program.id,
      name: program.name,
      productScope: program.productScope === "specific" ? "specific" : "all",
      estimatedTotal,
      commissionLabel: formatMoney(currency, estimatedTotal),
      lineCount: entries.length,
    });
  }

  const allowMultiSelect = availablePrograms.length > 1;

  // No selection yet: return options only, zero totals.
  if (!selectedIds || selectedIds.size === 0) {
    return {
      commissionTotal: 0,
      lines: [] as CommissionLineBreakdown[],
      programIds: [] as string[],
      programNames: [] as string[],
      availablePrograms,
      allowMultiSelect,
    };
  }

  const breakdown: CommissionLineBreakdown[] = [];
  let commissionTotal = 0;
  const claimedLines = new Set<string>();

  // Prefer specific programs when resolving overlapping selected matches.
  const selectedPrograms = params.programs
    .filter((program) => selectedIds.has(program.id))
    .sort((a, b) => {
      if (a.productScope === b.productScope) return 0;
      if (a.productScope === "specific") return -1;
      if (b.productScope === "specific") return 1;
      return 0;
    });

  for (const line of params.lines) {
    const lineKey = `${line.productId ?? "none"}:${line.title}:${line.quantity}:${line.discountedTotal}`;
    for (const program of selectedPrograms) {
      const entries = programLineMap.get(program.id) ?? [];
      const match = entries.find(
        (entry) =>
          entry.line === line ||
          (entry.line.productId === line.productId &&
            entry.line.title === line.title &&
            entry.line.quantity === line.quantity &&
            entry.line.discountedTotal === line.discountedTotal),
      );
      if (!match) continue;
      if (claimedLines.has(lineKey)) break;

      claimedLines.add(lineKey);
      commissionTotal += match.computed.commissionAmount;
      breakdown.push({
        title: line.title,
        quantity: line.quantity,
        productId: line.productId,
        programId: program.id,
        programName: program.name,
        commissionType: match.computed.commissionType,
        rate: match.computed.rate,
        baseAmount: match.computed.baseAmount,
        commissionAmount: match.computed.commissionAmount,
      });
      break;
    }
  }

  return {
    commissionTotal: Number(commissionTotal.toFixed(2)),
    lines: breakdown,
    programIds: Array.from(new Set(breakdown.map((line) => line.programId))),
    programNames: Array.from(new Set(breakdown.map((line) => line.programName))),
    availablePrograms,
    allowMultiSelect,
  };
}
