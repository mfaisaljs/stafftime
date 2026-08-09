export type ParsedCommissionProgramForm =
  | { error: string; staffError?: string }
  | {
      name: string;
      commissionType: string;
      afterDiscount: boolean;
      limitedTime: boolean;
      startDate: string | null;
      endDate: string | null;
      productScope: string;
      allProductsCommission: number | null;
      productCommissions: { productId: string; commission: string }[];
      employeeIds: string[];
    };

export function parseCommissionProgramForm(
  formData: FormData,
): ParsedCommissionProgramForm {
  const name = String(formData.get("programName") ?? "").trim();
  if (!name) {
    return { error: "Program name is required." };
  }

  const commissionType = String(formData.get("commissionType") ?? "fixed");
  const afterDiscount = formData.get("afterDiscount") === "true";
  const limitedTime = formData.get("limitedTime") === "true";
  const productScope = String(formData.get("productScope") ?? "all");
  const dateRange = String(formData.get("dateRange") ?? "");
  const [startDate = "", endDate = ""] = dateRange.split("--");
  const employeeIds = formData.getAll("employeeIds").map(String).filter(Boolean);
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  const allProductsCommissionRaw = String(formData.get("commissionValue") ?? "").trim();
  const allProductsCommission =
    productScope === "all" && allProductsCommissionRaw
      ? Number(allProductsCommissionRaw)
      : null;

  if (employeeIds.length === 0) {
    return {
      error: "Please select at least one staff member",
      staffError: "Please select at least one staff member",
    };
  }

  if (
    productScope === "all" &&
    allProductsCommissionRaw &&
    Number.isNaN(allProductsCommission)
  ) {
    return { error: "Enter a valid commission amount." };
  }

  if (productScope === "specific" && productIds.length === 0) {
    return { error: "Select at least one product." };
  }

  const productCommissions = productIds.map((productId) => ({
    productId,
    commission: String(formData.get(`commission_${productId}`) ?? "").trim(),
  }));

  return {
    name,
    commissionType,
    afterDiscount,
    limitedTime,
    startDate: limitedTime && startDate ? startDate : null,
    endDate: limitedTime && endDate ? endDate : null,
    productScope,
    allProductsCommission,
    productCommissions,
    employeeIds,
  };
}
