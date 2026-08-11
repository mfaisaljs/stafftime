import type { Prisma, Shift } from "@prisma/client";
import prisma from "../db.server";
import {
  enumerateDateKeys,
  getApprovedTimeOffForRange,
  requestCoversDateKey,
  type TimeOffRequestWithPolicy,
} from "./settings.server";

export const SHIFT_STATUS = {
  SCHEDULED: "SCHEDULED",
  CANCELLED_LEAVE: "CANCELLED_LEAVE",
} as const;

export type ShiftStatus = (typeof SHIFT_STATUS)[keyof typeof SHIFT_STATUS];

export type OverlappingShiftSummary = {
  id: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  locationName: string;
};

function startOfDayFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function endOfDayFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function toDateKeyLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeValue(value: Date) {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function employeeOnApprovedLeave(
  requests: TimeOffRequestWithPolicy[],
  employeeId: string,
  dateKey: string,
): TimeOffRequestWithPolicy | null {
  return (
    requests.find(
      (request) =>
        request.employeeId === employeeId &&
        requestCoversDateKey(request, dateKey),
    ) ?? null
  );
}

export function filterRequestsForEmployee(
  requests: TimeOffRequestWithPolicy[],
  employeeId: string,
) {
  return requests.filter((request) => request.employeeId === employeeId);
}

export function isScheduledShift(shift: Pick<Shift, "status">) {
  return shift.status === SHIFT_STATUS.SCHEDULED;
}

export async function findOverlappingScheduledShifts(params: {
  shopId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
}) {
  const rangeStart = startOfDayFromKey(params.startDate);
  const rangeEnd = endOfDayFromKey(params.endDate);
  return prisma.shift.findMany({
    where: {
      shopId: params.shopId,
      employeeId: params.employeeId,
      status: SHIFT_STATUS.SCHEDULED,
      startsAt: { gte: rangeStart, lte: rangeEnd },
    },
    include: { location: true },
    orderBy: { startsAt: "asc" },
  });
}

export function summarizeOverlappingShifts(
  shifts: Array<
    Shift & { location: { name: string } }
  >,
): OverlappingShiftSummary[] {
  return shifts.map((shift) => ({
    id: shift.id,
    dateKey: toDateKeyLocal(shift.startsAt),
    startTime: timeValue(shift.startsAt),
    endTime: timeValue(shift.endsAt),
    locationName: shift.location.name,
  }));
}

export async function cancelShiftsForApprovedLeave(
  tx: Prisma.TransactionClient,
  params: {
    shopId: string;
    employeeId: string;
    startDate: string;
    endDate: string;
  },
) {
  const rangeStart = startOfDayFromKey(params.startDate);
  const rangeEnd = endOfDayFromKey(params.endDate);
  const result = await tx.shift.updateMany({
    where: {
      shopId: params.shopId,
      employeeId: params.employeeId,
      status: SHIFT_STATUS.SCHEDULED,
      startsAt: { gte: rangeStart, lte: rangeEnd },
    },
    data: { status: SHIFT_STATUS.CANCELLED_LEAVE },
  });
  return result.count;
}

export async function approveTimeOffRequestForShop(params: {
  shopId: string;
  requestId: string;
  status: "APPROVED" | "DECLINED";
}) {
  const existing = await prisma.timeOffRequest.findFirst({
    where: { id: params.requestId, shopId: params.shopId },
    include: { policy: true },
  });
  if (!existing) {
    throw new Error("Time off request not found");
  }
  if (existing.status !== "PENDING") {
    throw new Error("This time off request has already been reviewed");
  }
  if (params.status !== "APPROVED" && params.status !== "DECLINED") {
    throw new Error("Select a valid review action");
  }

  let cancelledShiftCount = 0;
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.timeOffRequest.update({
      where: { id: existing.id },
      data: { status: params.status },
      include: { policy: true },
    });

    if (params.status === "APPROVED") {
      cancelledShiftCount = await cancelShiftsForApprovedLeave(tx, {
        shopId: params.shopId,
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
      });
    }

    return request;
  });

  return { request: updated, cancelledShiftCount };
}

export async function assertEmployeeNotOnApprovedLeave(params: {
  shopId: string;
  employeeId: string;
  dateKeys: string[];
  employeeName?: string;
}) {
  if (params.dateKeys.length === 0) return;

  const sorted = [...params.dateKeys].sort();
  const requests = await getApprovedTimeOffForRange(
    params.shopId,
    sorted[0],
    sorted[sorted.length - 1],
  );

  for (const dateKey of params.dateKeys) {
    const leave = employeeOnApprovedLeave(
      requests,
      params.employeeId,
      dateKey,
    );
    if (leave) {
      const label = params.employeeName ?? "This staff member";
      throw new Error(
        `${label} is on approved leave (${leave.policy.name}) on ${formatLeaveDate(dateKey)}.`,
      );
    }
  }
}

function formatLeaveDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function syncApprovedLeaveShiftCancellations(shopId: string) {
  const approved = await prisma.timeOffRequest.findMany({
    where: { shopId, status: "APPROVED" },
    select: { employeeId: true, startDate: true, endDate: true },
  });
  if (approved.length === 0) return 0;

  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const request of approved) {
      count += await cancelShiftsForApprovedLeave(tx, {
        shopId,
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
      });
    }
  });
  return count;
}

export function listApprovedLeaveDaysForEmployee(
  requests: TimeOffRequestWithPolicy[],
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  return enumerateDateKeys(startDate, endDate).flatMap((dateKey) => {
    const leave = employeeOnApprovedLeave(requests, employeeId, dateKey);
    if (!leave) return [];
    return [{ dateKey, policyName: leave.policy.name }];
  });
}

export function shiftIsCancelledForLeave(
  shift: { status?: string | null; startsAt: Date },
  requests: TimeOffRequestWithPolicy[],
  employeeId: string,
) {
  if (shift.status === SHIFT_STATUS.CANCELLED_LEAVE) return true;
  const dateKey = toDateKeyLocal(shift.startsAt);
  return employeeOnApprovedLeave(requests, employeeId, dateKey) !== null;
}
