import { afterEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  deleteShopData,
  handleAppUninstalled,
  handleCustomersRedact,
  handleShopRedact,
} from "./shop-lifecycle.server";
import { ensureShop } from "./workforce.server";

const TEST_DOMAIN = "webhook-lifecycle-test.myshopify.com";

async function cleanup() {
  await prisma.session.deleteMany({ where: { shop: TEST_DOMAIN } });
  await prisma.shop.deleteMany({ where: { domain: TEST_DOMAIN } });
}

describe("shop lifecycle webhooks", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("deletes shop data and sessions on uninstall", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await prisma.session.create({
      data: {
        id: "test-session",
        shop: TEST_DOMAIN,
        state: "state",
        accessToken: "token",
      },
    });
    await prisma.employee.create({
      data: {
        shopId: shop.id,
        firstName: "Pat",
        lastName: "Lee",
        pinHash: "hash",
        qrCode: "qr-uninstall",
      },
    });

    const result = await handleAppUninstalled(TEST_DOMAIN);

    expect(result.deleted).toBe(true);
    expect(await prisma.shop.findUnique({ where: { domain: TEST_DOMAIN } })).toBeNull();
    expect(await prisma.session.count({ where: { shop: TEST_DOMAIN } })).toBe(0);
  });

  it("shop redact is idempotent when shop is already gone", async () => {
    const result = await handleShopRedact(TEST_DOMAIN);
    expect(result.deleted).toBe(false);
  });

  it("redacts matching employee contact fields on customers/redact", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    const employee = await prisma.employee.create({
      data: {
        shopId: shop.id,
        firstName: "Alex",
        lastName: "Kim",
        email: "alex@example.com",
        phone: "+15551234567",
        paypalEmail: "alex@example.com",
        pinHash: "hash",
        qrCode: "qr-redact",
      },
    });

    const result = await handleCustomersRedact({
      shop: TEST_DOMAIN,
      customer: { email: "alex@example.com" },
    });

    expect(result.redactedEmployees).toBe(1);
    const updated = await prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(updated.email).toBeNull();
    expect(updated.phone).toBeNull();
    expect(updated.paypalEmail).toBeNull();
    expect(updated.firstName).toBe("Alex");
  });

  it("deleteShopData removes the shop record", async () => {
    await ensureShop(TEST_DOMAIN);
    const result = await deleteShopData(TEST_DOMAIN);
    expect(result.deleted).toBe(true);
    expect(await prisma.shop.findUnique({ where: { domain: TEST_DOMAIN } })).toBeNull();
  });
});
