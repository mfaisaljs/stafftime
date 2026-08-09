import type { Session } from "@shopify/shopify-api";
import prisma from "../db.server";
import { shopFromDest } from "../utils/http.server";
import {
  createEmployee,
  ensureDefaultLocation,
  ensureShop,
  getAttendanceSummary,
} from "./workforce.server";

export async function getAdminShop(session: Session) {
  const shop = await ensureShop(session.shop);
  await ensureDefaultLocation(shop.id);
  return prisma.shop.findUniqueOrThrow({
    where: { id: shop.id },
    include: { settings: true },
  });
}

export async function seedDemoData(session: Session) {
  const shop = await getAdminShop(session);
  const location = await ensureDefaultLocation(shop.id);

  const count = await prisma.employee.count({ where: { shopId: shop.id } });
  if (count > 0) return { seeded: false };

  const john = await createEmployee({
    shopId: shop.id,
    locationId: location.id,
    firstName: "John",
    lastName: "Rivera",
    email: "john@example.com",
    pin: "1234",
    role: "EMPLOYEE",
    hourlyRate: 18,
    department: "Sales",
  });

  const sarah = await createEmployee({
    shopId: shop.id,
    locationId: location.id,
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah@example.com",
    pin: "5678",
    role: "SUPERVISOR",
    hourlyRate: 22,
    department: "Operations",
  });

  const monday = new Date();
  monday.setHours(9, 0, 0, 0);
  const mondayEnd = new Date(monday);
  mondayEnd.setHours(17, 0, 0, 0);

  const tuesday = new Date(monday);
  tuesday.setDate(tuesday.getDate() + 1);
  tuesday.setHours(12, 0, 0, 0);
  const tuesdayEnd = new Date(tuesday);
  tuesdayEnd.setHours(20, 0, 0, 0);

  await prisma.shift.createMany({
    data: [
      {
        shopId: shop.id,
        locationId: location.id,
        employeeId: john.id,
        startsAt: monday,
        endsAt: mondayEnd,
      },
      {
        shopId: shop.id,
        locationId: location.id,
        employeeId: sarah.id,
        startsAt: tuesday,
        endsAt: tuesdayEnd,
      },
    ],
  });

  return { seeded: true };
}

export async function getDashboardData(session: Session) {
  await seedDemoData(session);
  const summary = await getAttendanceSummary(session.shop);
  const shop = await getAdminShop(session);

  const laborCostToday = summary.working.reduce((total, entry) => {
    return total + (entry.employee.hourlyRate * 8);
  }, 0);

  return {
    summary,
    laborCostToday,
    shopName: shop.name ?? shopFromDest(session.shop),
  };
}

export async function getEmployees(session: Session) {
  const shop = await getAdminShop(session);
  return prisma.employee.findMany({
    where: { shopId: shop.id },
    include: { location: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getSchedules(session: Session) {
  const shop = await getAdminShop(session);
  const start = new Date();
  start.setDate(start.getDate() - 1);
  const end = new Date();
  end.setDate(end.getDate() + 14);

  return prisma.shift.findMany({
    where: {
      shopId: shop.id,
      startsAt: { gte: start, lte: end },
    },
    include: {
      employee: true,
      location: true,
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function getPayrollEntries(session: Session, days = 7) {
  const shop = await getAdminShop(session);
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  return prisma.timeEntry.findMany({
    where: {
      shopId: shop.id,
      clockInAt: { gte: start },
    },
    include: {
      employee: true,
      breaks: true,
      location: true,
    },
    orderBy: { clockInAt: "desc" },
  });
}

export async function getMissedPunches(session: Session) {
  const shop = await getAdminShop(session);
  return prisma.missedPunchRequest.findMany({
    where: { shopId: shop.id },
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  });
}
