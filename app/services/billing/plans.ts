export const FREE_PLAN_HANDLE = "free";
export const ADDITIONAL_STAFF_METER = "additional_staff";

export type PlanHandle =
  | "free"
  | "small-business"
  | "workforce"
  | "enterprise";

export type PaidPlanHandle = Exclude<PlanHandle, "free">;

export type Plan = {
  handle: PlanHandle;
  name: string;
  monthlyPrice: number;
  includedStaff: number;
  extraStaffRate: number;
  maxStaff: number;
  trialDays: number;
  featured?: boolean;
  description: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    handle: "free",
    name: "Free",
    monthlyPrice: 0,
    includedStaff: 2,
    extraStaffRate: 6,
    maxStaff: 22,
    trialDays: 0,
    description: "Get started with two staff seats.",
    features: [
      "Clock in and out",
      "Photo attendance",
      "Basic scheduling",
      "Time-off requests",
    ],
  },
  {
    handle: "small-business",
    name: "Small Business",
    monthlyPrice: 24.99,
    includedStaff: 5,
    extraStaffRate: 5,
    maxStaff: 25,
    trialDays: 0,
    description: "For growing POS teams.",
    features: [
      "Clock in and out",
      "Scheduling",
      "Payroll export",
      "Task lists",
      "Reports",
      "Time off",
      "Photo attendance",
    ],
  },
  {
    handle: "workforce",
    name: "Workforce",
    monthlyPrice: 39.99,
    includedStaff: 10,
    extraStaffRate: 4,
    maxStaff: 100,
    trialDays: 7,
    featured: true,
    description: "Full workforce toolkit for busy stores.",
    features: [
      "Everything in Small Business",
      "Commission programs",
      "Sales targets",
      "Manager view",
      "Photo attendance",
      "Time off policies",
    ],
  },
  {
    handle: "enterprise",
    name: "Enterprise",
    monthlyPrice: 199.99,
    includedStaff: 100,
    extraStaffRate: 2,
    maxStaff: 500,
    trialDays: 7,
    description: "High-volume teams and multi-location ops.",
    features: [
      "Everything in Workforce",
      "Highest staff allowance",
      "Lowest extra-seat rate",
      "Priority onboarding",
    ],
  },
];

export const PAID_PLANS = PLANS.filter(
  (plan): plan is Plan & { handle: PaidPlanHandle } => plan.handle !== "free",
);

export const FREE_PLAN = PLANS.find((plan) => plan.handle === "free")!;

export function isPlanHandle(value: string): value is PlanHandle {
  return PLANS.some((plan) => plan.handle === value);
}

export function getPlan(handle: string | null | undefined): Plan {
  if (handle && isPlanHandle(handle)) {
    return PLANS.find((plan) => plan.handle === handle)!;
  }
  return FREE_PLAN;
}

export function includedStaffFromHandle(handle: string | null | undefined): number {
  return getPlan(handle).includedStaff;
}

export function staffLimitFromHandle(handle: string | null | undefined): number {
  return getPlan(handle).maxStaff;
}

export function extraSeatMax(plan: Plan) {
  return Math.max(0, plan.maxStaff - plan.includedStaff);
}

const PLAN_ORDER: PlanHandle[] = [
  "free",
  "small-business",
  "workforce",
  "enterprise",
];

export function nextPlan(handle: string | null | undefined): Plan | null {
  const current = getPlan(handle);
  const index = PLAN_ORDER.indexOf(current.handle);
  if (index < 0 || index >= PLAN_ORDER.length - 1) {
    return null;
  }
  return getPlan(PLAN_ORDER[index + 1]);
}

/** True when extra-seat cost meets or beats the next plan's monthly price. */
export function extrasTriggerNextPlan(plan: Plan, extraStaff: number) {
  const next = nextPlan(plan.handle);
  if (!next || extraStaff <= 0) {
    return false;
  }
  return extraStaff * plan.extraStaffRate >= next.monthlyPrice;
}

export function extraStaffCount(staffCount: number, includedStaff: number) {
  return Math.max(0, Math.floor(staffCount) - includedStaff);
}

export function extraStaffPrice(
  staffCount: number,
  includedStaff: number,
  extraStaffRate: number,
) {
  return extraStaffCount(staffCount, includedStaff) * extraStaffRate;
}

export function estimatedMonthlyTotal(plan: Plan, staffCount: number) {
  return plan.monthlyPrice + extraStaffPrice(staffCount, plan.includedStaff, plan.extraStaffRate);
}

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/** Overage units that should be reported to the additional_staff meter. */
export function usageOverage(staffCount: number, includedStaff: number) {
  return extraStaffCount(staffCount, includedStaff);
}

export function usageDeltaForStaffChange(params: {
  previousCount: number;
  nextCount: number;
  includedStaff: number;
}) {
  return (
    usageOverage(params.nextCount, params.includedStaff) -
    usageOverage(params.previousCount, params.includedStaff)
  );
}

export function shopifyPricingPlansUrl(params: {
  shopDomain: string;
  appHandle: string;
}) {
  const storeHandle = params.shopDomain
    .replace(/\.myshopify\.com$/i, "")
    .split(".")[0]
    .toLowerCase();
  return `https://admin.shopify.com/store/${storeHandle}/charges/${params.appHandle}/pricing_plans`;
}

export function getAppHandle() {
  return process.env.SHOPIFY_APP_HANDLE?.trim() || "trubuild-staff-management-39";
}
