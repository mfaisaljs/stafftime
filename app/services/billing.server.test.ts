import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  extraStaffPrice,
  getPlan,
  staffLimitFromHandle,
  usageDeltaForStaffChange,
} from "./billing/plans";
import {
  assertStaffSeatAvailable,
  reportStaffUsageDelta,
  StaffSeatLimitError,
  syncSubscriptionFromPlanHandle,
} from "./billing.server";
import { createEmployee, ensureShop } from "./workforce.server";

const TEST_DOMAIN = "billing-qa-test.myshopify.com";

async function cleanup() {
  await prisma.shop.deleteMany({ where: { domain: TEST_DOMAIN } });
}

describe("billing plan catalog", () => {
  it("maps each handle to the included staff limit", () => {
    expect(staffLimitFromHandle("free")).toBe(2);
    expect(staffLimitFromHandle("small-business")).toBe(5);
    expect(staffLimitFromHandle("workforce")).toBe(10);
    expect(staffLimitFromHandle("enterprise")).toBe(100);
    expect(staffLimitFromHandle("unknown")).toBe(2);
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
    expect(
      usageDeltaForStaffChange({
        previousCount: 2,
        nextCount: 1,
        includedStaff: 2,
      }),
    ).toBe(0);
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

  it("syncs staffLimit from each plan handle", async () => {
    await ensureShop(TEST_DOMAIN);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "small-business");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(5);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "workforce");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(10);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "enterprise");
    expect(
      (await prisma.shop.findUniqueOrThrow({ where: { domain: TEST_DOMAIN } }))
        .staffLimit,
    ).toBe(100);

    await syncSubscriptionFromPlanHandle(TEST_DOMAIN, "free");
    const freeShop = await prisma.shop.findUniqueOrThrow({
      where: { domain: TEST_DOMAIN },
    });
    expect(freeShop.staffLimit).toBe(2);
    expect(freeShop.planHandle).toBe("free");
  });

  it("blocks create once the shop is at its staff cap", async () => {
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

    await expect(assertStaffSeatAvailable(shop.id)).rejects.toBeInstanceOf(
      StaffSeatLimitError,
    );
    await expect(
      createEmployee({
        shopId: shop.id,
        firstName: "Three",
        lastName: "Seat",
        pin: "1003",
      }),
    ).rejects.toBeInstanceOf(StaffSeatLimitError);
  });

  it("reports +1 on create and -1 on archive only after included seats", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        shopifyShopGid: "gid://shopify/Shop/999",
        staffLimit: 5,
        planHandle: "small-business",
      },
    });
    process.env.SHOPIFY_APP_EVENTS_TOKEN = "test-token";

    const calls: Array<{ value: number; key: string }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        idempotency_key: string;
        attributes: { value: number };
      };
      calls.push({ value: body.attributes.value, key: body.idempotency_key });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

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
    expect(calls[0]?.value).toBe(1);
    expect(created.skipped === false && created.idempotencyKey.length).toBeGreaterThan(0);

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
    expect(calls[1]?.value).toBe(-1);
    expect(calls[0]?.key).not.toBe(calls[1]?.key);
  });
});
