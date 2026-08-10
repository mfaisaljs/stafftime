import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  activateEmployeeOnFirstLogin,
  assertPinAvailable,
  clockIn,
  clockOut,
  createEmployee,
  endBreak,
  ensureDefaultLocation,
  ensureShop,
  findEmployeeByPin,
  getAttendanceSummary,
  startBreak,
  updateEmployee,
} from "./workforce.server";
import { buildPayrollCsv } from "./payroll-export.server";

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

  it("keeps new staff inactive until first successful login", async () => {
    const { employee } = await seedTestShop();

    expect(employee.status).toBe("INACTIVE");
    expect(employee.firstLoginAt).toBeNull();

    const activated = await activateEmployeeOnFirstLogin(employee.id);
    expect(activated.status).toBe("ACTIVE");
    expect(activated.firstLoginAt).toBeInstanceOf(Date);
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

  it("updates staff profile and enforces PIN uniqueness on edit", async () => {
    const { shop, employee } = await seedTestShop();
    await createEmployee({
      shopId: shop.id,
      firstName: "Taylor",
      lastName: "Second",
      pin: "9876",
    });

    const updated = await updateEmployee({
      shopId: shop.id,
      employeeId: employee.id,
      firstName: "Alexis",
      lastName: "Tester",
      position: "Supervisor",
      role: "SUPERVISOR",
      pin: "5555",
    });

    expect(updated.firstName).toBe("Alexis");
    expect(updated.position).toBe("Supervisor");
    await expect(
      updateEmployee({
        shopId: shop.id,
        employeeId: employee.id,
        firstName: "Alexis",
        lastName: "Tester",
        pin: "9876",
      }),
    ).rejects.toThrow("PIN already assigned to Taylor Second");
  });

  it("keeps historical labor cost at the rate captured on clock-in", async () => {
    const { shop, employee } = await seedTestShop();
    await clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id });

    const clockInAt = new Date(Date.now() - 60 * 60 * 1000);
    const clockOutAt = new Date();
    await prisma.timeEntry.updateMany({
      where: { employeeId: employee.id, status: "OPEN" },
      data: { clockInAt, clockOutAt, status: "CLOSED" },
    });

    await updateEmployee({
      shopId: shop.id,
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      hourlyRate: 166,
    });

    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: employee.id },
      include: { employee: true, breaks: true, location: true },
    });
    const csv = buildPayrollCsv(entries, { overtimeDailyHours: 8 });

    expect(entries[0]?.hourlyRateSnapshot).toBe(20);
    expect(csv).toContain(",20,20");
  });

  it("rejects clock-in before shift start when early clock-in is disabled", async () => {
    const { shop, employee } = await seedTestShop();
    await prisma.setting.update({
      where: { shopId: shop.id },
      data: { allowEarlyClockIn: false },
    });

    const startsAt = new Date();
    startsAt.setHours(startsAt.getHours() + 2, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(endsAt.getHours() + 8);

    const location = await ensureDefaultLocation(shop.id);
    await prisma.shift.create({
      data: {
        shopId: shop.id,
        employeeId: employee.id,
        locationId: location.id,
        startsAt,
        endsAt,
      },
    });

    await expect(
      clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id }),
    ).rejects.toThrow(/Clock-in is not allowed until shift starts/);
  });

  it("rejects starting a break after scheduled shift end when enabled", async () => {
    const { shop, employee } = await seedTestShop();
    await prisma.setting.update({
      where: { shopId: shop.id },
      data: { blockBreakAfterEndTime: true, allowEarlyClockIn: true },
    });

    const endsAt = new Date();
    endsAt.setMinutes(endsAt.getMinutes() - 30);
    const startsAt = new Date(endsAt);
    startsAt.setHours(startsAt.getHours() - 8);

    const location = await ensureDefaultLocation(shop.id);
    await prisma.shift.create({
      data: {
        shopId: shop.id,
        employeeId: employee.id,
        locationId: location.id,
        startsAt,
        endsAt,
      },
    });

    await clockIn({ shopDomain: TEST_DOMAIN, employeeId: employee.id });

    await expect(
      startBreak({ shopDomain: TEST_DOMAIN, employeeId: employee.id }),
    ).rejects.toThrow(/Breaks are not allowed after scheduled shift end time/);
  });
});
