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

export async function ensureShop(destOrDomain: string) {
  const domain = shopFromDest(destOrDomain);
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
  pin: string;
  role?: Employee["role"];
  hourlyRate?: number;
  department?: string;
}) {
  return prisma.employee.create({
    data: {
      shopId: input.shopId,
      locationId: input.locationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      pinHash: await hashPin(input.pin),
      qrCode: randomUUID(),
      role: input.role ?? "EMPLOYEE",
      hourlyRate: input.hourlyRate ?? 0,
      department: input.department,
    },
  });
}

export async function findEmployeeByPin(destOrDomain: string, pin: string) {
  const shop = await ensureShop(destOrDomain);
  const employees = await prisma.employee.findMany({
    where: { shopId: shop.id, status: "ACTIVE" },
  });

  for (const employee of employees) {
    if (await verifyPin(pin, employee.pinHash)) {
      return employee;
    }
  }

  return null;
}

export async function findEmployeeByQr(destOrDomain: string, qrCode: string) {
  const shop = await ensureShop(destOrDomain);
  return prisma.employee.findFirst({
    where: { shopId: shop.id, qrCode, status: "ACTIVE" },
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
    breakStartAt,
    shiftStart: shift?.startsAt.toISOString(),
    shiftEnd: shift?.endsAt.toISOString(),
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

  const entry = await prisma.timeEntry.create({
    data: {
      shopId: shop.id,
      locationId: location.id,
      employeeId: params.employeeId,
      clockInAt: new Date(),
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
        clockInAt: { gte: start },
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
