import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  assertPinAvailable,
  clockIn,
  clockOut,
  createEmployee,
  endBreak,
  ensureShop,
  findEmployeeByPin,
  getAttendanceSummary,
  startBreak,
} from "./workforce.server";

const TEST_DOMAIN = "pos-qa-test.myshopify.com";

async function cleanupTestShop() {
  await prisma.shop.deleteMany({ where: { domain: TEST_DOMAIN } });
}

async function seedTestShop() {
  const shop = await ensureShop(TEST_DOMAIN);
  const employee = await createEmployee({
    shopId: shop.id,
    firstName: "Alex",
    lastName: "Tester",
    pin: "4321",
    hourlyRate: 20,
  });
  return { shop, employee };
}

describe("POS workflow", () => {
  beforeEach(async () => {
    await cleanupTestShop();
  });

  afterEach(async () => {
    await cleanupTestShop();
  });

  it("verifies employee by PIN and returns clocked-out status", async () => {
    const { employee } = await seedTestShop();

    const match = await findEmployeeByPin(TEST_DOMAIN, "4321");
    expect(match?.id).toBe(employee.id);

    const status = await clockIn({
      shopDomain: TEST_DOMAIN,
      employeeId: employee.id,
    });
    expect(status.status).toBe("CLOCKED_IN");
    expect(status.clockInAtMs).toBeTypeOf("number");
  });

  it("runs clock in → break → end break → clock out", async () => {
    const { employee } = await seedTestShop();

    let status = await clockIn({
      shopDomain: TEST_DOMAIN,
      employeeId: employee.id,
    });
    expect(status.status).toBe("CLOCKED_IN");

    status = await startBreak({
      shopDomain: TEST_DOMAIN,
      employeeId: employee.id,
    });
    expect(status.status).toBe("ON_BREAK");
    expect(status.breakStartAt).toBeTruthy();

    status = await endBreak({
      shopDomain: TEST_DOMAIN,
      employeeId: employee.id,
    });
    expect(status.status).toBe("CLOCKED_IN");

    status = await clockOut({
      shopDomain: TEST_DOMAIN,
      employeeId: employee.id,
    });
    expect(status.status).toBe("CLOCKED_OUT");
    expect(status.clockInAtMs).toBeUndefined();
  });

  it("reflects working staff in attendance summary after clock-in", async () => {
    const { employee } = await seedTestShop();

    let summary = await getAttendanceSummary(TEST_DOMAIN);
    expect(summary.workingCount).toBe(0);

    await clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id });

    summary = await getAttendanceSummary(TEST_DOMAIN);
    expect(summary.workingCount).toBe(1);
    expect(summary.working[0]?.employeeId).toBe(employee.id);
  });

  it("shows on-break staff separately in attendance summary", async () => {
    const { employee } = await seedTestShop();

    await clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id });
    await startBreak({ shopDomain: TEST_DOMAIN, employeeId: employee.id });

    const summary = await getAttendanceSummary(TEST_DOMAIN);
    expect(summary.workingCount).toBe(0);
    expect(summary.onBreakCount).toBe(1);
    expect(summary.onBreak[0]?.employeeId).toBe(employee.id);
  });

  it("rejects duplicate PIN on create and ambiguous PIN lookup", async () => {
    const shop = await ensureShop(TEST_DOMAIN);
    const first = await createEmployee({
      shopId: shop.id,
      firstName: "Jamie",
      lastName: "One",
      pin: "1111",
    });
    await createEmployee({
      shopId: shop.id,
      firstName: "Jordan",
      lastName: "Two",
      pin: "2222",
    });

    await expect(
      assertPinAvailable(shop.id, "1111"),
    ).rejects.toThrow("PIN already assigned to Jamie One");

    await prisma.employee.update({
      where: { id: (await prisma.employee.findFirst({
        where: { shopId: shop.id, firstName: "Jordan" },
      }))!.id },
      data: { pinHash: first.pinHash },
    });

    await expect(findEmployeeByPin(TEST_DOMAIN, "1111")).rejects.toThrow(
      "This PIN matches multiple employees",
    );
  });

  it("prevents double clock-in", async () => {
    const { employee } = await seedTestShop();

    await clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id });

    await expect(
      clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id }),
    ).rejects.toThrow("Employee is already clocked in");
  });
});
