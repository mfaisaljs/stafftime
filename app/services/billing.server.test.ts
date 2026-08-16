import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  appSubscriptionLineItems,
  extraStaffPrice,
  extrasTriggerNextPlan,
  getPlan,
  includedStaffFromHandle,
  nextPlan,
  staffLimitFromHandle,
  usageDeltaForStaffChange,
} from "./billing/plans";
import {
  assertStaffSeatAvailable,
  ensureUsageCycle,
  reconcileStaffUsage,
  reportStaffUsageDelta,
  StaffSeatLimitError,
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

    expect(staffLimitFromHandle("free")).toBe(22);
    expect(staffLimitFromHandle("small-business")).toBe(25);
    expect(staffLimitFromHandle("workforce")).toBe(100);
    expect(staffLimitFromHandle("enterprise")).toBe(500);
    expect(staffLimitFromHandle("unknown")).toBe(22);
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

  it("builds a recurring plus usage line for paid plans", () => {
    const items = appSubscriptionLineItems(getPlan("small-business"));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      plan: { appRecurringPricingDetails: { price: { amount: 24.99 } } },
    });
    expect(items[1]).toMatchObject({
      plan: { appUsagePricingDetails: { cappedAmount: { amount: 100 } } },
    });
  });

  it("builds a zero-dollar recurring plus usage line for free", () => {
    const items = appSubscriptionLineItems(getPlan("free"));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      plan: { appRecurringPricingDetails: { price: { amount: 0 } } },
    });
    expect(items[1]).toMatchObject({
      plan: { appUsagePricingDetails: { cappedAmount: { amount: 120 } } },
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

  it("syncs staffLimit to each plan maxStaff", async () => {
    await ensureShop(TEST_DOMAIN);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "small-business");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(25);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "workforce");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(100);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "enterprise");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(500);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "free");
    const freeShop = await prisma.shop.findUniqueOrThrow({
      where: { domain: TEST_DOMAIN },
    });
    expect(freeShop.staffLimit).toBe(22);
    expect(freeShop.planHandle).toBe("free");
  });

  it("allows a 3rd Free staff member and blocks only at maxStaff", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
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

    await prisma.employee.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        shopId: shop.id,
        firstName: `Cap${index}`,
        lastName: "Seat",
        pinHash: `hash-${index}`,
        qrCode: `qr-cap-${index}-${shop.id}`,
      })),
    });

    await expect(assertStaffSeatAvailable(shop.id)).rejects.toMatchObject({
      name: "StaffSeatLimitError",
      staffLimit: 22,
      nextPlanName: "Small Business",
    });
  });

  it("reports +1 on the 3rd Free seat and 0 on the 2nd", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { shopifyShopGid: "gid://shopify/Shop/999" },
    });
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";
    const { calls, fetchImpl } = mockUsageFetch();

    await seedEmployees(shop.id, 2);
    const second = await reconcileStaffUsage(TEST_DOMAIN, { fetchImpl });
    expect(second).toEqual({ skipped: true, reason: "zero_delta" });
    expect(calls).toHaveLength(0);

    await createEmployee({
      shopId: shop.id,
      firstName: "Third",
      lastName: "Seat",
      pin: "1099",
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

    const sixth = await createEmployee({
      shopId: shop.id,
      firstName: "Sixth",
      lastName: "Seat",
      pin: "1506",
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
        reportedStaffUsage: 3,
        usageCycleKey: "2000-01",
      },
    });
    await seedEmployees(shop.id, 5);
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";
    const { calls, fetchImpl } = mockUsageFetch();

    const result = await ensureUsageCycle(TEST_DOMAIN, {
      fetchImpl,
      cycleKey: "2026-08",
    });
    expect(result).toMatchObject({ rolled: true, skipped: false, delta: 3 });
    expect(calls[0]?.value).toBe(3);

    const shopAfter = await prisma.shop.findUniqueOrThrow({
      where: { domain: TEST_DOMAIN },
    });
    expect(shopAfter.usageCycleKey).toBe("2026-08");
    expect(shopAfter.reportedStaffUsage).toBe(3);
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
