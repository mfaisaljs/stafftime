import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  appSubscriptionLineItems,
  extraStaffPrice,
  effectiveMaxStaff,
  extrasTriggerNextPlan,
  getPlan,
  includedStaffFromHandle,
  nextPlan,
  staffLimitFromHandle,
  subscribedSeatCount,
  usageDeltaForStaffChange,
} from "./billing/plans";
import {
  assertStaffSeatAvailable,
  ensureUsageCycle,
  reconcileStaffUsage,
  reportStaffUsageDelta,
  StaffSeatLimitError,
  SubscribedSeatLimitError,
  syncSubscriptionFromPlanHandle,
} from "./billing.server";
import { createEmployee, ensureShop } from "./workforce.server";

const TEST_DOMAIN = "billing-qa-test.myshopify.com";

async function cleanup() {
  await prisma.shop.deleteMany({ where: { domain: TEST_DOMAIN } });
}

function mockUsageFetch() {
  const calls: Array<{ value: number; key: string }> = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      idempotency_key: string;
      attributes: { value: number };
    };
    calls.push({ value: body.attributes.value, key: body.idempotency_key });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return { calls, fetchImpl };
}

async function seedEmployees(shopId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await createEmployee({
      shopId,
      firstName: `Staff${index}`,
      lastName: "Seat",
      pin: String(1000 + index),
    });
  }
}

describe("billing plan catalog", () => {
  it("maps each handle to included seats and max staff", () => {
    expect(includedStaffFromHandle("free")).toBe(2);
    expect(includedStaffFromHandle("small-business")).toBe(5);
    expect(includedStaffFromHandle("workforce")).toBe(10);
    expect(includedStaffFromHandle("enterprise")).toBe(100);

    expect(staffLimitFromHandle("free")).toBe(52);
    expect(staffLimitFromHandle("small-business")).toBe(25);
    expect(staffLimitFromHandle("workforce")).toBe(100);
    expect(staffLimitFromHandle("enterprise")).toBe(500);
    expect(staffLimitFromHandle("unknown")).toBe(52);
  });

  it("offers the next plan after each max", () => {
    expect(nextPlan("free")?.handle).toBe("small-business");
    expect(nextPlan("small-business")?.handle).toBe("workforce");
    expect(nextPlan("workforce")?.handle).toBe("enterprise");
    expect(nextPlan("enterprise")).toBeNull();
  });

  it("suggests Small Business once Free extras cost as much as that plan", () => {
    const free = getPlan("free");
    expect(extrasTriggerNextPlan(free, 4)).toBe(false);
    expect(extrasTriggerNextPlan(free, 5)).toBe(true);
  });

  it("caps free at 52 staff (2 included + 50 extras)", () => {
    const free = getPlan("free");
    expect(effectiveMaxStaff(free)).toBe(52);
    expect(extrasTriggerNextPlan(free, 5)).toBe(true);
    expect(extrasTriggerNextPlan(free, 4)).toBe(false);
  });

  it("computes subscribed seats from included plus reported usage", () => {
    expect(subscribedSeatCount(2, 0)).toBe(2);
    expect(subscribedSeatCount(2, 3)).toBe(5);
    expect(subscribedSeatCount(5, 2)).toBe(7);
  });

  it("flags shops that have not completed plan selection", async () => {
    const { shopNeedsPlanSelection } = await import("./billing.server");
    expect(shopNeedsPlanSelection("none")).toBe(true);
    expect(shopNeedsPlanSelection("active")).toBe(false);
    expect(shopNeedsPlanSelection("trial")).toBe(false);
  });

  it("builds a recurring plus usage line for paid plans", () => {
    const items = appSubscriptionLineItems(getPlan("small-business"));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      plan: { appRecurringPricingDetails: { price: { amount: 24.99 } } },
    });
    expect(items[1]).toMatchObject({
      plan: { appUsagePricingDetails: { cappedAmount: { amount: 275 } } },
    });
  });

  it("uses the configured usage cap for each plan", () => {
    expect(getPlan("free").usageCappedAmount).toBe(301);
    expect(getPlan("small-business").usageCappedAmount).toBe(275);
    expect(getPlan("workforce").usageCappedAmount).toBe(650);
    expect(getPlan("enterprise").usageCappedAmount).toBe(2100);
    expect(
      appSubscriptionLineItems(getPlan("workforce"))[1],
    ).toMatchObject({
      plan: { appUsagePricingDetails: { cappedAmount: { amount: 650 } } },
    });
    expect(
      appSubscriptionLineItems(getPlan("enterprise"))[1],
    ).toMatchObject({
      plan: { appUsagePricingDetails: { cappedAmount: { amount: 2100 } } },
    });
  });

  it("builds a zero-dollar recurring plus usage line for free", () => {
    const items = appSubscriptionLineItems(getPlan("free"));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      plan: { appRecurringPricingDetails: { price: { amount: 0 } } },
    });
    expect(items[1]).toMatchObject({
      plan: { appUsagePricingDetails: { cappedAmount: { amount: 301 } } },
    });
  });

  it("prices extra staff as (n - included) * rate", () => {
    const free = getPlan("free");
    expect(extraStaffPrice(2, free.includedStaff, free.extraStaffRate)).toBe(0);
    expect(extraStaffPrice(3, free.includedStaff, free.extraStaffRate)).toBe(6);
    expect(extraStaffPrice(5, free.includedStaff, free.extraStaffRate)).toBe(18);

    const workforce = getPlan("workforce");
    expect(
      extraStaffPrice(12, workforce.includedStaff, workforce.extraStaffRate),
    ).toBe(8);
  });

  it("ignores the first included seats when computing usage deltas", () => {
    expect(
      usageDeltaForStaffChange({
        previousCount: 1,
        nextCount: 2,
        includedStaff: 2,
      }),
    ).toBe(0);
    expect(
      usageDeltaForStaffChange({
        previousCount: 2,
        nextCount: 3,
        includedStaff: 2,
      }),
    ).toBe(1);
    expect(
      usageDeltaForStaffChange({
        previousCount: 3,
        nextCount: 2,
        includedStaff: 2,
      }),
    ).toBe(-1);
  });
});

describe("billing enforcement and usage", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
    delete process.env.SHOPIFY_APP_EVENTS_TOKEN;
  });

  it("syncs staffLimit to each plan effective cap", async () => {
    await ensureShop(TEST_DOMAIN);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "small-business");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(12);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "workforce");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(59);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "enterprise");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(500);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "free");
    const freeShop = await prisma.shop.findUniqueOrThrow({
      where: { domain: TEST_DOMAIN },
    });
    expect(freeShop.staffLimit).toBe(52);
    expect(freeShop.planHandle).toBe("free");
  });

  it("blocks adds when subscribed seats are full", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { subscriptionStatus: "active" },
    });
    await createEmployee({
      shopId: shop.id,
      firstName: "One",
      lastName: "Seat",
      pin: "1001",
    });
    await createEmployee({
      shopId: shop.id,
      firstName: "Two",
      lastName: "Seat",
      pin: "1002",
    });

    await expect(assertStaffSeatAvailable(shop.id)).rejects.toBeInstanceOf(
      SubscribedSeatLimitError,
    );
    await expect(
      createEmployee({
        shopId: shop.id,
        firstName: "Three",
        lastName: "Seat",
        pin: "1003",
      }),
    ).rejects.toBeInstanceOf(SubscribedSeatLimitError);
  });

  it("allows one extra hire when an extra seat is subscribed on Free", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { subscriptionStatus: "active", reportedStaffUsage: 1 },
    });
    await createEmployee({
      shopId: shop.id,
      firstName: "One",
      lastName: "Seat",
      pin: "1001",
    });
    await createEmployee({
      shopId: shop.id,
      firstName: "Two",
      lastName: "Seat",
      pin: "1002",
    });

    await expect(assertStaffSeatAvailable(shop.id)).resolves.toBeUndefined();
    await expect(
      createEmployee({
        shopId: shop.id,
        firstName: "Three",
        lastName: "Seat",
        pin: "1003",
      }),
    ).resolves.toMatchObject({ firstName: "Three" });
  });

  it("allows a 3rd Free staff member and blocks at the effective cap", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { subscriptionStatus: "active", reportedStaffUsage: 50 },
    });
    await prisma.employee.createMany({
      data: Array.from({ length: 52 }, (_, index) => ({
        shopId: shop.id,
        firstName: `Cap${index}`,
        lastName: "Seat",
        pinHash: `hash-${index}`,
        qrCode: `qr-cap-${index}-${shop.id}`,
      })),
    });

    await expect(assertStaffSeatAvailable(shop.id)).rejects.toMatchObject({
      name: "StaffSeatLimitError",
      staffLimit: 52,
      nextPlanName: "Small Business",
    });
  });

  it("reports +1 on the 3rd Free seat and 0 on the 2nd", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { shopifyShopGid: "gid://shopify/Shop/999", subscriptionStatus: "active" },
    });
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";
    const { calls, fetchImpl } = mockUsageFetch();

    await seedEmployees(shop.id, 2);
    const second = await reconcileStaffUsage(TEST_DOMAIN, { fetchImpl });
    expect(second).toEqual({ skipped: true, reason: "zero_delta" });
    expect(calls).toHaveLength(0);

    await prisma.employee.create({
      data: {
        shopId: shop.id,
        firstName: "Third",
        lastName: "Seat",
        pinHash: "hash-third",
        qrCode: `qr-third-${shop.id}`,
      },
    });
    const third = await reconcileStaffUsage(TEST_DOMAIN, { fetchImpl });
    expect(third).toMatchObject({ skipped: false, delta: 1 });
    expect(calls[0]?.value).toBe(1);
  });

  it("reports +1 for the 6th Small Business seat and -1 when that extra is archived", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "small-business");
    await prisma.shop.update({
      where: { id: shop.id },
      data: { shopifyShopGid: "gid://shopify/Shop/999" },
    });
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";
    const { calls, fetchImpl } = mockUsageFetch();

    await seedEmployees(shop.id, 5);
    expect(await reconcileStaffUsage(TEST_DOMAIN, { fetchImpl })).toEqual({
      skipped: true,
      reason: "zero_delta",
    });

    const sixth = await prisma.employee.create({
      data: {
        shopId: shop.id,
        firstName: "Sixth",
        lastName: "Seat",
        pinHash: "hash-sixth",
        qrCode: `qr-sixth-${shop.id}`,
      },
    });
    expect(await reconcileStaffUsage(TEST_DOMAIN, { fetchImpl })).toMatchObject({
      skipped: false,
      delta: 1,
    });

    await prisma.employee.update({
      where: { id: sixth.id },
      data: { status: "ARCHIVED" },
    });
    expect(await reconcileStaffUsage(TEST_DOMAIN, { fetchImpl })).toMatchObject({
      skipped: false,
      delta: -1,
    });
    expect(calls.map((call) => call.value)).toEqual([1, -1]);
  });

  it("re-reports current extras when the usage cycle key changes", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        shopifyShopGid: "gid://shopify/Shop/999",
        reportedStaffUsage: 2,
        usageCycleKey: "2000-01",
      },
    });
    await seedEmployees(shop.id, 4);
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";
    const { calls, fetchImpl } = mockUsageFetch();

    const result = await ensureUsageCycle(TEST_DOMAIN, {
      fetchImpl,
      cycleKey: "2026-08",
    });
    expect(result).toMatchObject({ rolled: true, skipped: false, delta: 2 });
    expect(calls[0]?.value).toBe(2);

    const shopAfter = await prisma.shop.findUniqueOrThrow({
      where: { domain: TEST_DOMAIN },
    });
    expect(shopAfter.usageCycleKey).toBe("2026-08");
    expect(shopAfter.reportedStaffUsage).toBe(2);
  });

  it("reports +1 on create and -1 on archive only after included seats", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        shopifyShopGid: "gid://shopify/Shop/999",
        planHandle: "small-business",
      },
    });
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";
    const { calls, fetchImpl } = mockUsageFetch();

    const first = await reportStaffUsageDelta(
      TEST_DOMAIN,
      usageDeltaForStaffChange({
        previousCount: 1,
        nextCount: 2,
        includedStaff: 2,
      }),
      { fetchImpl },
    );
    expect(first).toEqual({ skipped: true, reason: "zero_delta" });
    expect(calls).toHaveLength(0);

    const created = await reportStaffUsageDelta(
      TEST_DOMAIN,
      usageDeltaForStaffChange({
        previousCount: 2,
        nextCount: 3,
        includedStaff: 2,
      }),
      { fetchImpl },
    );
    expect(created).toMatchObject({ skipped: false, delta: 1 });

    const archived = await reportStaffUsageDelta(
      TEST_DOMAIN,
      usageDeltaForStaffChange({
        previousCount: 3,
        nextCount: 2,
        includedStaff: 2,
      }),
      { fetchImpl },
    );
    expect(archived).toMatchObject({ skipped: false, delta: -1 });
    expect(calls.map((call) => call.value)).toEqual([1, -1]);
  });
});
