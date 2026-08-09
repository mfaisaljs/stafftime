import type { Session } from "@shopify/shopify-api";
import prisma from "../db.server";
import { shopFromDest } from "../utils/http.server";
import {
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

export async function getDashboardData(session: Session) {
  const summary = await getAttendanceSummary(session.shop);
  const shop = await getAdminShop(session);

  const laborCostToday = summary.working.reduce((total, entry) => {
    return total + ((entry.hourlyRateSnapshot ?? entry.employee.hourlyRate) * 8);
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

export async function getEmployeeById(session: Session, employeeId: string) {
  const shop = await getAdminShop(session);
  return prisma.employee.findFirst({
    where: { id: employeeId, shopId: shop.id },
    include: { location: true },
  });
}

export async function getEmployeeTimeEntries(
  session: Session,
  employeeId: string,
  startDate: Date,
  endDate: Date,
) {
  const shop = await getAdminShop(session);
  return prisma.timeEntry.findMany({
    where: {
      shopId: shop.id,
      employeeId,
      clockInAt: { gte: startDate, lte: endDate },
    },
    include: { breaks: true, location: true },
    orderBy: { clockInAt: "desc" },
  });
}

export async function getEmployeeLocations(session: Session) {
  const shop = await getAdminShop(session);
  return prisma.storeLocation.findMany({
    where: { shopId: shop.id, active: true },
    orderBy: { name: "asc" },
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

export async function getPayrollEntriesForRange(
  session: Session,
  startDate: Date,
  endDate: Date,
) {
  const shop = await getAdminShop(session);
  return prisma.timeEntry.findMany({
    where: {
      shopId: shop.id,
      clockInAt: { gte: startDate, lte: endDate },
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
