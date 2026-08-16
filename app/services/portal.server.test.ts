import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import { createEmployee, ensureShop } from "./workforce.server";
import {
  getPortalTimesheet,
  isPortalFeatureEnabled,
  loadPortalShop,
  portalFeaturesFromSettings,
  verifyPortalPin,
} from "./portal.server";

const TEST_DOMAIN = "portal-qa-test.myshopify.com";

async function cleanup() {
  await prisma.shop.deleteMany({ where: { domain: TEST_DOMAIN } });
}

describe("staff web portal", { timeout: 30000 }, () => {
  beforeEach(async () => {
    await cleanup();
  }, 20000);

  afterEach(async () => {
    await cleanup();
  }, 20000);

  it("does not create a shop from a public portal lookup", async () => {
    await expect(loadPortalShop("missing-portal.myshopify.com")).rejects.toThrow(
      /does not have a StaffTime portal/i,
    );
    const created = await prisma.shop.findUnique({
      where: { domain: "missing-portal.myshopify.com" },
    });
    expect(created).toBeNull();
  });

  it("verifies a staff PIN for an installed shop", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    const employee = await createEmployee({
      shopId: shop.id,
      firstName: "Portal",
      lastName: "Staff",
      pin: "2468",
    });

    const result = await verifyPortalPin({
      shopDomain: TEST_DOMAIN,
      pin: "2468",
      feature: "clock",
    });
    expect(result.employee.id).toBe(employee.id);
    expect(result.employee.status).toBe("ACTIVE");
  });

  it("rejects an invalid PIN and disabled features", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    await createEmployee({
      shopId: shop.id,
      firstName: "Portal",
      lastName: "Staff",
      pin: "2468",
    });
    await prisma.setting.update({
      where: { shopId: shop.id },
      data: { portalClockIn: false, portalManagerView: true },
    });

    await expect(
      verifyPortalPin({ shopDomain: TEST_DOMAIN, pin: "0000", feature: "clock" }),
    ).rejects.toThrow(/disabled|invalid/i);

    await expect(
      verifyPortalPin({ shopDomain: TEST_DOMAIN, pin: "2468", feature: "clock" }),
    ).rejects.toThrow(/disabled/i);

    await expect(
      verifyPortalPin({ shopDomain: TEST_DOMAIN, pin: "0000" }),
    ).rejects.toThrow(/invalid pin/i);

    await expect(
      verifyPortalPin({
        shopDomain: TEST_DOMAIN,
        pin: "2468",
        feature: "manager",
      }),
    ).rejects.toThrow(/manager access/i);
  });

  it("builds a monthly timesheet from clock entries", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    const employee = await createEmployee({
      shopId: shop.id,
      firstName: "Portal",
      lastName: "Staff",
      pin: "2468",
    });
    const location = await prisma.storeLocation.create({
      data: {
        shopId: shop.id,
        shopifyLocationId: "portal-test",
        name: "Portal Store",
      },
    });
    const now = new Date();
    await prisma.timeEntry.create({
      data: {
        shopId: shop.id,
        locationId: location.id,
        employeeId: employee.id,
        clockInAt: new Date(now.getFullYear(), now.getMonth(), 3, 9, 0, 0),
        clockOutAt: new Date(now.getFullYear(), now.getMonth(), 3, 17, 0, 0),
        status: "CLOSED",
        hourlyRateSnapshot: 20,
        source: "PORTAL",
      },
    });

    await prisma.shift.create({
      data: {
        shopId: shop.id,
        locationId: location.id,
        employeeId: employee.id,
        startsAt: new Date(now.getFullYear(), now.getMonth(), 4, 10, 0, 0),
        endsAt: new Date(now.getFullYear(), now.getMonth(), 4, 18, 0, 0),
        status: "SCHEDULED",
      },
    });

    const timesheet = await getPortalTimesheet({
      shopDomain: TEST_DOMAIN,
      employeeId: employee.id,
    });
    expect(timesheet.days.some((day) => day.status === "worked")).toBe(true);
    expect(timesheet.days.some((day) => day.shifts.length > 0)).toBe(true);
    expect(timesheet.weeks.length).toBeGreaterThan(0);
    expect(timesheet.totalHoursLabel).not.toBe("0m");
  });

  it("exposes portal feature flags from settings", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    const settings = await prisma.setting.findUniqueOrThrow({
      where: { shopId: shop.id },
    });
    const features = portalFeaturesFromSettings(settings);
    expect(features.map((item) => item.key)).toContain("clock");
    expect(isPortalFeatureEnabled(settings, "clock")).toBe(true);
  });
});
