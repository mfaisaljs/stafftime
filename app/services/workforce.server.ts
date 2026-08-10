import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type {
  BreakType,
  Employee,
  MissedPunchStatus,
  MissedPunchType,
  Prisma,
} from "@prisma/client";
import prisma from "../db.server";
import { shopFromDest } from "../utils/http.server";

export type WorkforceStatus = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";
type EmployeeWithFirstLogin = Employee & { firstLoginAt: Date | null };

export async function ensureShop(destOrDomain: string) {
  const domain = shopFromDest(destOrDomain).toLowerCase();
  return prisma.shop.upsert({
    where: { domain },
    update: {},
    create: {
      domain,
      name: domain,
      settings: { create: {} },
    },
    include: { settings: true },
  });
}

export async function ensureDefaultLocation(shopId: string) {
  const existing = await prisma.storeLocation.findFirst({ where: { shopId } });
  if (existing) return existing;

  return prisma.storeLocation.create({
    data: {
      shopId,
      shopifyLocationId: "default",
      name: "Main Store",
    },
  });
}

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, pinHash: string) {
  return bcrypt.compare(pin, pinHash);
}

export async function createEmployee(input: {
  shopId: string;
  locationId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  pin: string;
  role?: Employee["role"];
  status?: Employee["status"];
  firstLoginAt?: Date;
  hourlyRate?: number;
  position?: string;
  department?: string;
  locationAccess?: string;
  currency?: string;
  payrollType?: string;
  salaryAmount?: number;
  weeklyAvailability?: string;
  paymentMethod?: string;
  paypalEmail?: string;
  paypalAccountName?: string;
  bankAccountType?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  routingNumber?: string;
}) {
  await assertPinAvailable(input.shopId, input.pin);

  return prisma.employee.create({
    data: {
      shopId: input.shopId,
      locationId: input.locationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      pinHash: await hashPin(input.pin),
      qrCode: randomUUID(),
      role: input.role ?? "EMPLOYEE",
      status: input.status ?? "INACTIVE",
      firstLoginAt: input.firstLoginAt,
      hourlyRate: input.hourlyRate ?? 0,
      position: input.position,
      department: input.department,
      locationAccess: input.locationAccess ?? "ALL",
      currency: input.currency ?? "USD",
      payrollType: input.payrollType ?? "HOURLY",
      salaryAmount: input.salaryAmount ?? 0,
      weeklyAvailability: input.weeklyAvailability,
      paymentMethod: input.paymentMethod ?? "PAYPAL",
      paypalEmail: input.paypalEmail,
      paypalAccountName: input.paypalAccountName,
      bankAccountType: input.bankAccountType,
      bankName: input.bankName,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      routingNumber: input.routingNumber,
    },
  });
}

export async function updateEmployee(input: {
  shopId: string;
  employeeId: string;
  locationId?: string | null;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  pin?: string;
  role?: Employee["role"];
  hourlyRate?: number;
  position?: string;
  department?: string;
  locationAccess?: string;
  currency?: string;
  payrollType?: string;
  salaryAmount?: number;
  weeklyAvailability?: string;
  paymentMethod?: string;
  paypalEmail?: string;
  paypalAccountName?: string;
  bankAccountType?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  routingNumber?: string;
}) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, shopId: input.shopId },
  });

  if (!employee) {
    throw new Error("Staff member not found");
  }

  const data = {
    locationId: input.locationId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    role: input.role,
    hourlyRate: input.hourlyRate ?? 0,
    position: input.position,
    department: input.department,
    locationAccess: input.locationAccess ?? "ALL",
    currency: input.currency ?? "USD",
    payrollType: input.payrollType ?? "HOURLY",
    salaryAmount: input.salaryAmount ?? 0,
    weeklyAvailability: input.weeklyAvailability,
    paymentMethod: input.paymentMethod ?? "PAYPAL",
    paypalEmail: input.paypalEmail,
    paypalAccountName: input.paypalAccountName,
    bankAccountType: input.bankAccountType,
    bankName: input.bankName,
    accountHolderName: input.accountHolderName,
    accountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    pinHash: undefined as string | undefined,
  };

  if (input.pin) {
    await assertPinAvailable(input.shopId, input.pin, input.employeeId);
    data.pinHash = await hashPin(input.pin);
  }

  return prisma.employee.update({
    where: { id: input.employeeId },
    data,
  });
}

export async function findPinMatches(shopId: string, pin: string) {
  const employees = await prisma.employee.findMany({
    where: { shopId },
  });

  const matches = [];
  for (const employee of employees) {
    if (await verifyPin(pin, employee.pinHash)) {
      matches.push(employee);
    }
  }

  return matches;
}

export async function assertPinAvailable(
  shopId: string,
  pin: string,
  excludeEmployeeId?: string,
) {
  const matches = await findPinMatches(shopId, pin);
  const conflict = matches.find((employee) => employee.id !== excludeEmployeeId);
  if (conflict) {
    throw new Error(
      `PIN already assigned to ${conflict.firstName} ${conflict.lastName}`,
    );
  }
}

export async function findEmployeeByPin(destOrDomain: string, pin: string) {
  const shop = await ensureShop(destOrDomain);
  const matches = (await findPinMatches(shop.id, pin)).filter((employee) =>
    canUseForLogin(employee as EmployeeWithFirstLogin),
  );

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new Error(
      "This PIN matches multiple employees. Ask your manager to assign unique PINs.",
    );
  }

  return matches[0];
}

export async function findEmployeeByQr(destOrDomain: string, qrCode: string) {
  const shop = await ensureShop(destOrDomain);
  return prisma.employee.findFirst({
    where: {
      shopId: shop.id,
      qrCode,
      OR: [{ status: "ACTIVE" }, { firstLoginAt: null }],
    },
  });
}

function canUseForLogin(employee: EmployeeWithFirstLogin) {
  if (employee.status === "ARCHIVED") {
    return false;
  }
  return employee.status === "ACTIVE" || employee.firstLoginAt === null;
}

export async function bulkArchiveEmployees(shopId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return { count: 0 };

  const result = await prisma.employee.updateMany({
    where: {
      shopId,
      id: { in: employeeIds },
      status: { not: "ARCHIVED" },
    },
    data: { status: "ARCHIVED" },
  });

  return { count: result.count };
}

function parseJsonIdArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

async function removeEmployeesFromCommissionPrograms(
  shopId: string,
  employeeIds: string[],
) {
  const removeSet = new Set(employeeIds);
  const programs = await prisma.commissionProgram.findMany({
    where: { shopId },
    select: { id: true, employeeIds: true },
  });

  await Promise.all(
    programs.map(async (program) => {
      const current = parseJsonIdArray(program.employeeIds);
      const next = current.filter((id) => !removeSet.has(id));
      if (next.length === current.length) return;
      await prisma.commissionProgram.update({
        where: { id: program.id },
        data: { employeeIds: JSON.stringify(next) },
      });
    }),
  );
}

async function removeEmployeesFromSalesTargets(
  shopId: string,
  employeeIds: string[],
) {
  const removeSet = new Set(employeeIds);
  const targets = await prisma.salesTarget.findMany({
    where: { shopId },
    select: { id: true, employeeIds: true },
  });

  await Promise.all(
    targets.map(async (target) => {
      const current = parseJsonIdArray(target.employeeIds);
      const next = current.filter((id) => !removeSet.has(id));
      if (next.length === current.length) return;

      if (next.length === 0) {
        await prisma.salesTarget.delete({ where: { id: target.id } });
        return;
      }

      await prisma.salesTarget.update({
        where: { id: target.id },
        data: { employeeIds: JSON.stringify(next) },
      });
    }),
  );

  await prisma.salesTargetSnapshot.deleteMany({
    where: {
      shopId,
      employeeId: { in: employeeIds },
    },
  });
}

export async function bulkDeleteEmployees(shopId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return { count: 0 };

  await removeEmployeesFromCommissionPrograms(shopId, employeeIds);
  await removeEmployeesFromSalesTargets(shopId, employeeIds);

  const result = await prisma.employee.deleteMany({
    where: {
      shopId,
      id: { in: employeeIds },
    },
  });

  return { count: result.count };
}

export async function activateEmployeeOnFirstLogin(employeeId: string) {
  const employee = (await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  })) as EmployeeWithFirstLogin;

  if (employee.firstLoginAt) {
    return employee;
  }

  return prisma.employee.update({
    where: { id: employee.id },
    data: {
      status: "ACTIVE",
      firstLoginAt: new Date(),
    },
  });
}

export async function getEmployeeShiftToday(employeeId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return prisma.shift.findFirst({
    where: {
      employeeId,
      startsAt: { gte: start, lte: end },
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function getOpenTimeEntry(employeeId: string) {
  return prisma.timeEntry.findFirst({
    where: { employeeId, status: "OPEN" },
    include: {
      breaks: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { clockInAt: "desc" },
  });
}

export async function buildEmployeeStatus(employeeId: string) {
  const [entry, shift] = await Promise.all([
    getOpenTimeEntry(employeeId),
    getEmployeeShiftToday(employeeId),
  ]);

  let status: WorkforceStatus = "CLOCKED_OUT";
  let breakStartAt: string | undefined;

  if (entry) {
    const openBreak = entry.breaks[0];
    if (openBreak) {
      status = "ON_BREAK";
      breakStartAt = openBreak.startedAt.toISOString();
    } else {
      status = "CLOCKED_IN";
    }
  }

  return {
    employeeId,
    employeeName: "",
    status,
    clockInAt: entry?.clockInAt.toISOString(),
    clockInAtMs: entry?.clockInAt.getTime(),
    breakStartAt,
    shiftStart: shift?.startsAt.toISOString(),
    shiftEnd: shift?.endsAt.toISOString(),
    serverTime: Date.now(),
  };
}

async function writeAudit(
  shopId: string,
  action: string,
  entityType: string,
  entityId: string,
  previous?: Prisma.InputJsonValue,
  next?: Prisma.InputJsonValue,
  actorId?: string,
) {
  await prisma.auditLog.create({
    data: {
      shopId,
      actorId,
      actorType: actorId ? "employee" : "system",
      action,
      entityType,
      entityId,
      previous: previous ? JSON.stringify(previous) : null,
      next: next ? JSON.stringify(next) : null,
    },
  });
}

export async function clockIn(params: {
  shopDomain: string;
  employeeId: string;
  locationId?: string;
  latitude?: number;
  longitude?: number;
  deviceId?: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const location =
    (params.locationId
      ? await prisma.storeLocation.findFirst({
          where: { id: params.locationId, shopId: shop.id },
        })
      : null) ?? (await ensureDefaultLocation(shop.id));

  const openEntry = await getOpenTimeEntry(params.employeeId);
  if (openEntry) {
    throw new Error("Employee is already clocked in");
  }
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, shopId: shop.id },
  });
  if (!employee) {
    throw new Error("Staff member not found");
  }

  const entry = await prisma.timeEntry.create({
    data: {
      shopId: shop.id,
      locationId: location.id,
      employeeId: params.employeeId,
      clockInAt: new Date(),
      hourlyRateSnapshot: employee.hourlyRate,
      source: "POS",
      latitude: params.latitude,
      longitude: params.longitude,
      deviceId: params.deviceId,
    },
  });

  await writeAudit(shop.id, "clock_in", "TimeEntry", entry.id, undefined, {
    employeeId: params.employeeId,
    clockInAt: entry.clockInAt,
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function clockOut(params: {
  shopDomain: string;
  employeeId: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const entry = await getOpenTimeEntry(params.employeeId);
  if (!entry) {
    throw new Error("Employee is not clocked in");
  }

  const openBreak = entry.breaks[0];
  if (openBreak) {
    await prisma.breakEntry.update({
      where: { id: openBreak.id },
      data: { endedAt: new Date() },
    });
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      clockOutAt: new Date(),
      status: "CLOSED",
    },
  });

  await writeAudit(shop.id, "clock_out", "TimeEntry", updated.id, {
    status: "OPEN",
  }, {
    status: "CLOSED",
    clockOutAt: updated.clockOutAt,
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function startBreak(params: {
  shopDomain: string;
  employeeId: string;
  type?: BreakType;
}) {
  const shop = await ensureShop(params.shopDomain);
  const entry = await getOpenTimeEntry(params.employeeId);
  if (!entry) {
    throw new Error("Employee must be clocked in to start a break");
  }
  if (entry.breaks[0]) {
    throw new Error("Employee is already on break");
  }

  const breakEntry = await prisma.breakEntry.create({
    data: {
      timeEntryId: entry.id,
      type: params.type ?? "UNPAID",
      startedAt: new Date(),
    },
  });

  await writeAudit(shop.id, "break_start", "BreakEntry", breakEntry.id, undefined, {
    employeeId: params.employeeId,
    startedAt: breakEntry.startedAt,
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function endBreak(params: {
  shopDomain: string;
  employeeId: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const entry = await getOpenTimeEntry(params.employeeId);
  if (!entry?.breaks[0]) {
    throw new Error("Employee is not on break");
  }

  const openBreak = entry.breaks[0];
  const updated = await prisma.breakEntry.update({
    where: { id: openBreak.id },
    data: { endedAt: new Date() },
  });

  await writeAudit(shop.id, "break_end", "BreakEntry", updated.id, {
    endedAt: null,
  }, {
    endedAt: updated.endedAt,
  });

  return buildEmployeeStatus(params.employeeId);
}

export async function createMissedPunchRequest(params: {
  shopDomain: string;
  employeeId: string;
  type: MissedPunchType;
  requestedAt: Date;
  reason?: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  return prisma.missedPunchRequest.create({
    data: {
      shopId: shop.id,
      employeeId: params.employeeId,
      type: params.type,
      requestedAt: params.requestedAt,
      reason: params.reason,
    },
  });
}

export async function reviewMissedPunch(params: {
  shopDomain: string;
  requestId: string;
  status: Exclude<MissedPunchStatus, "PENDING">;
  reviewedBy: string;
  reviewNotes?: string;
}) {
  const shop = await ensureShop(params.shopDomain);
  const request = await prisma.missedPunchRequest.findFirst({
    where: { id: params.requestId, shopId: shop.id },
    include: { employee: true },
  });

  if (!request) {
    throw new Error("Missed punch request not found");
  }
  if (request.status !== "PENDING") {
    throw new Error("Request has already been reviewed");
  }

  const updated = await prisma.missedPunchRequest.update({
    where: { id: request.id },
    data: {
      status: params.status,
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: params.reviewNotes,
    },
  });

  if (params.status === "APPROVED") {
    const location = await ensureDefaultLocation(shop.id);
    if (request.type === "CLOCK_IN") {
      await prisma.timeEntry.create({
        data: {
          shopId: shop.id,
          locationId: location.id,
          employeeId: request.employeeId,
          clockInAt: request.requestedAt,
          clockOutAt: null,
          status: "OPEN",
          hourlyRateSnapshot: request.employee.hourlyRate,
          source: "MISSED_PUNCH",
          notes: request.reason,
        },
      });
    } else if (request.type === "CLOCK_OUT") {
      const openEntry = await getOpenTimeEntry(request.employeeId);
      if (openEntry) {
        await prisma.timeEntry.update({
          where: { id: openEntry.id },
          data: {
            clockOutAt: request.requestedAt,
            status: "CLOSED",
          },
        });
      }
    }
  }

  await writeAudit(
    shop.id,
    "missed_punch_review",
    "MissedPunchRequest",
    updated.id,
    { status: "PENDING" },
    { status: updated.status },
    params.reviewedBy,
  );

  return updated;
}

export async function getAttendanceSummary(shopDomain: string) {
  const shop = await ensureShop(shopDomain);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [employees, openEntries, shifts, pendingRequests] = await Promise.all([
    prisma.employee.findMany({
      where: { shopId: shop.id, status: "ACTIVE" },
      include: { location: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        shopId: shop.id,
        status: "OPEN",
      },
      include: {
        employee: true,
        breaks: { where: { endedAt: null } },
      },
    }),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        startsAt: { gte: start },
      },
      include: { employee: true, location: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.missedPunchRequest.count({
      where: { shopId: shop.id, status: "PENDING" },
    }),
  ]);

  const clockedInIds = new Set(openEntries.map((entry) => entry.employeeId));
  const onBreak = openEntries.filter((entry) => entry.breaks.length > 0);
  const working = openEntries.filter((entry) => entry.breaks.length === 0);

  const absent = employees.filter((employee) => {
    const hasShift = shifts.some((shift) => shift.employeeId === employee.id);
    const isClockedIn = clockedInIds.has(employee.id);
    return hasShift && !isClockedIn;
  });

  const late = openEntries.filter((entry) => {
    const shift = shifts.find((item) => item.employeeId === entry.employeeId);
    if (!shift) return false;
    return entry.clockInAt.getTime() > shift.startsAt.getTime() + 5 * 60 * 1000;
  });

  return {
    workingCount: working.length,
    onBreakCount: onBreak.length,
    absentCount: absent.length,
    lateCount: late.length,
    pendingApprovals: pendingRequests,
    working,
    onBreak,
    absent,
    late,
    upcomingShifts: shifts,
    totalEmployees: employees.length,
  };
}

export async function resolveShopFromRequest(dest: string) {
  return ensureShop(shopFromDest(dest));
}
