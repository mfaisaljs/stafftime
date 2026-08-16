import { randomUUID } from "crypto";
import prisma from "../db.server";
import { shopFromDest } from "../utils/http.server";
import {
  ADDITIONAL_STAFF_METER,
  FREE_PLAN,
  FREE_PLAN_HANDLE,
  getAppHandle,
  getPlan,
  nextPlan,
  shopifyPricingPlansUrl,
  usageDeltaForStaffChange,
  usageOverage,
  type Plan,
  type PlanHandle,
} from "./billing/plans";

export class StaffSeatLimitError extends Error {
  readonly staffLimit: number;
  readonly nextPlanName: string | null;

  constructor(staffLimit: number, nextPlanName: string | null) {
    super(
      nextPlanName
        ? `This plan allows up to ${staffLimit} staff. Upgrade to ${nextPlanName} to add more.`
        : `This plan allows up to ${staffLimit} staff.`,
    );
    this.name = "StaffSeatLimitError";
    this.staffLimit = staffLimit;
    this.nextPlanName = nextPlanName;
  }
}

export type ShopBilling = {
  shopId: string;
  domain: string;
  planHandle: PlanHandle;
  plan: Plan;
  billingInterval: "monthly";
  staffLimit: number;
  includedStaff: number;
  extraStaffCount: number;
  extraStaffRate: number;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  shopifyShopGid: string | null;
  reportedStaffUsage: number;
  usageCycleKey: string | null;
  activeStaffCount: number;
  availableSeats: number;
  atCap: boolean;
  nextPlan: Plan | null;
  pricingPlansUrl: string;
};

const DEFAULT_BILLING = {
  planHandle: FREE_PLAN_HANDLE,
  billingInterval: "monthly" as const,
  staffLimit: FREE_PLAN.maxStaff,
  subscriptionStatus: "none",
  trialEndsAt: null as Date | null,
  reportedStaffUsage: 0,
};

export function calendarUsageCycleKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function countActiveStaff(shopId: string) {
  return prisma.employee.count({
    where: { shopId, status: { not: "ARCHIVED" } },
  });
}

export async function getShopBilling(shopDomain: string): Promise<ShopBilling> {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopFromDest(shopDomain).toLowerCase() },
  });

  if (!shop) {
    const plan = FREE_PLAN;
    return {
      shopId: "",
      domain: shopFromDest(shopDomain).toLowerCase(),
      planHandle: plan.handle,
      plan,
      billingInterval: "monthly",
      staffLimit: plan.maxStaff,
      includedStaff: plan.includedStaff,
      extraStaffCount: 0,
      extraStaffRate: plan.extraStaffRate,
      subscriptionStatus: "none",
      trialEndsAt: null,
      shopifyShopGid: null,
      reportedStaffUsage: 0,
      usageCycleKey: null,
      activeStaffCount: 0,
      availableSeats: plan.maxStaff,
      atCap: false,
      nextPlan: nextPlan(plan.handle),
      pricingPlansUrl: shopifyPricingPlansUrl({
        shopDomain,
        appHandle: getAppHandle(),
      }),
    };
  }

  const plan = getPlan(shop.planHandle);
  const activeStaffCount = await countActiveStaff(shop.id);
  const staffLimit = plan.maxStaff;
  const extraStaffCount = usageOverage(activeStaffCount, plan.includedStaff);

  return {
    shopId: shop.id,
    domain: shop.domain,
    planHandle: plan.handle,
    plan,
    billingInterval: "monthly",
    staffLimit,
    includedStaff: plan.includedStaff,
    extraStaffCount,
    extraStaffRate: plan.extraStaffRate,
    subscriptionStatus: shop.subscriptionStatus,
    trialEndsAt: shop.trialEndsAt?.toISOString() ?? null,
    shopifyShopGid: shop.shopifyShopGid,
    reportedStaffUsage: shop.reportedStaffUsage,
    usageCycleKey: shop.usageCycleKey,
    activeStaffCount,
    availableSeats: Math.max(staffLimit - activeStaffCount, 0),
    atCap: activeStaffCount >= staffLimit,
    nextPlan: nextPlan(plan.handle),
    pricingPlansUrl: shopifyPricingPlansUrl({
      shopDomain: shop.domain,
      appHandle: getAppHandle(),
    }),
  };
}

export async function syncSubscriptionFromPlanHandle(
  shopDomain: string,
  planHandle: string,
) {
  const domain = shopFromDest(shopDomain).toLowerCase();
  const plan = getPlan(planHandle);
  const trialEndsAt =
    plan.trialDays > 0
      ? new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000)
      : null;

  return prisma.shop.update({
    where: { domain },
    data: {
      planHandle: plan.handle,
      billingInterval: "monthly",
      staffLimit: plan.maxStaff,
      subscriptionStatus:
        plan.handle === FREE_PLAN_HANDLE
          ? "active"
          : trialEndsAt
            ? "trial"
            : "active",
      trialEndsAt,
    },
  });
}

type PartnerSubscription = {
  planHandle: string | null;
  billingPeriod: string | null;
  trialEndsAt: string | null;
  status: string | null;
  cycleStart: string | null;
};

export async function refreshSubscription(shopDomain: string) {
  const domain = shopFromDest(shopDomain).toLowerCase();
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return null;

  const remote = await fetchActiveSubscription(shop.shopifyShopGid);
  if (remote === undefined) {
    return shop;
  }

  if (remote === null) {
    return prisma.shop.update({
      where: { id: shop.id },
      data: DEFAULT_BILLING,
    });
  }

  const plan = getPlan(remote.planHandle);
  return prisma.shop.update({
    where: { id: shop.id },
    data: {
      planHandle: plan.handle,
      billingInterval: "monthly",
      staffLimit: plan.maxStaff,
      subscriptionStatus: remote.status ?? (plan.handle === "free" ? "none" : "active"),
      trialEndsAt: remote.trialEndsAt ? new Date(remote.trialEndsAt) : null,
    },
  });
}

export async function assertStaffSeatAvailable(shopId: string) {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  const activeStaffCount = await countActiveStaff(shopId);
  const plan = getPlan(shop.planHandle);
  const staffLimit = plan.maxStaff;
  if (activeStaffCount >= staffLimit) {
    throw new StaffSeatLimitError(staffLimit, nextPlan(plan.handle)?.name ?? null);
  }
}

export async function saveShopifyShopGid(shopDomain: string, shopGid: string) {
  const domain = shopFromDest(shopDomain).toLowerCase();
  return prisma.shop.update({
    where: { domain },
    data: { shopifyShopGid: shopGid },
  });
}

export function usageDeltaFromCounts(params: {
  previousCount: number;
  nextCount: number;
  includedStaff: number;
}) {
  return usageDeltaForStaffChange(params);
}

type ReportResult =
  | { skipped: true; reason: "zero_delta" | "no_credentials" | "no_shop_gid" }
  | { skipped: false; delta: number; idempotencyKey: string };

export async function reportStaffUsageDelta(
  shopDomain: string,
  delta: number,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<ReportResult> {
  if (delta === 0) {
    return { skipped: true, reason: "zero_delta" };
  }

  const domain = shopFromDest(shopDomain).toLowerCase();
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) {
    return { skipped: true, reason: "no_shop_gid" };
  }

  const token = process.env.SHOPIFY_APP_EVENTS_TOKEN?.trim();
  if (!token) {
    return { skipped: true, reason: "no_credentials" };
  }

  const shopGid =
    shop.shopifyShopGid ??
    process.env.SHOPIFY_SHOP_GID?.trim() ??
    null;
  if (!shopGid) {
    return { skipped: true, reason: "no_shop_gid" };
  }

  const idempotencyKey = `staff_${shop.id}_${delta > 0 ? "inc" : "dec"}_${randomUUID()}`.slice(
    0,
    64,
  );
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.shopify.com/app/unstable/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      shop_id: shopGid,
      event_handle: ADDITIONAL_STAFF_METER,
      timestamp: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      attributes: { value: delta },
    }),
  });

  if (!response.ok) {
    return { skipped: true, reason: "no_credentials" };
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: { reportedStaffUsage: shop.reportedStaffUsage + delta },
  });

  return { skipped: false, delta, idempotencyKey };
}

export async function rollUsageCycleIfNeeded(
  shopDomain: string,
  deps: { now?: Date; cycleKey?: string } = {},
) {
  const domain = shopFromDest(shopDomain).toLowerCase();
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) {
    return { rolled: false as const, cycleKey: null };
  }

  const remote = await fetchActiveSubscription(shop.shopifyShopGid);
  const cycleKey =
    deps.cycleKey ??
    (remote !== undefined && remote?.cycleStart
      ? remote.cycleStart.slice(0, 10)
      : calendarUsageCycleKey(deps.now));

  if (shop.usageCycleKey === cycleKey) {
    return { rolled: false as const, cycleKey };
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      usageCycleKey: cycleKey,
      reportedStaffUsage: 0,
    },
  });

  return { rolled: true as const, cycleKey };
}

export async function ensureUsageCycle(
  shopDomain: string,
  deps: { fetchImpl?: typeof fetch; now?: Date; cycleKey?: string } = {},
) {
  const { rolled } = await rollUsageCycleIfNeeded(shopDomain, deps);
  if (!rolled) {
    return { skipped: true as const, reason: "same_cycle" as const, rolled: false };
  }
  const result = await reconcileStaffUsage(shopDomain, deps);
  return { ...result, rolled: true };
}

export async function reconcileStaffUsage(
  shopDomain: string,
  deps: { fetchImpl?: typeof fetch; now?: Date; cycleKey?: string } = {},
) {
  await rollUsageCycleIfNeeded(shopDomain, deps);
  const billing = await getShopBilling(shopDomain);
  if (!billing.shopId) {
    return { skipped: true as const, reason: "no_shop" as const };
  }

  const includedStaff = billing.plan.includedStaff;
  const targetOverage = usageOverage(billing.activeStaffCount, includedStaff);
  const delta = targetOverage - billing.reportedStaffUsage;
  try {
    return await reportStaffUsageDelta(shopDomain, delta, deps);
  } catch {
    return { skipped: true as const, reason: "no_credentials" as const };
  }
}

async function fetchActiveSubscription(
  shopGid: string | null,
): Promise<PartnerSubscription | null | undefined> {
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN?.trim();
  const appId = process.env.SHOPIFY_APP_ID?.trim();
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID?.trim();
  const endpoint =
    process.env.SHOPIFY_PARTNER_API_URL?.trim() ||
    (orgId
      ? `https://partners.shopify.com/${orgId}/api/2026-01/graphql.json`
      : null);

  if (!token || !appId || !shopGid || !endpoint) {
    return undefined;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: `#graphql
        query ActiveSubscription($appId: ID!, $shopId: ID!) {
          activeSubscription(appId: $appId, shopId: $shopId) {
            billingPeriod
            trialEndsAt
            currentBillingCycle {
              startTime
            }
            items {
              handle
            }
          }
        }
      `,
      variables: { appId, shopId: shopGid },
    }),
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as {
    data?: {
      activeSubscription?: {
        billingPeriod?: string | null;
        trialEndsAt?: string | null;
        currentBillingCycle?: { startTime?: string | null } | null;
        items?: Array<{ handle?: string | null }>;
      } | null;
    };
  };

  const subscription = payload.data?.activeSubscription;
  if (!subscription) {
    return null;
  }

  const planHandle =
    subscription.items?.find((item) => item.handle && item.handle !== ADDITIONAL_STAFF_METER)
      ?.handle ??
    subscription.items?.[0]?.handle ??
    null;

  return {
    planHandle,
    billingPeriod: subscription.billingPeriod ?? "monthly",
    trialEndsAt: subscription.trialEndsAt ?? null,
    status: subscription.trialEndsAt ? "trial" : "active",
    cycleStart: subscription.currentBillingCycle?.startTime ?? null,
  };
}
