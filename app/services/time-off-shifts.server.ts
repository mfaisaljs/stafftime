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

export async function restoreShiftsCancelledForLeave(
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
      status: SHIFT_STATUS.CANCELLED_LEAVE,
      startsAt: { gte: rangeStart, lte: rangeEnd },
    },
    data: { status: SHIFT_STATUS.SCHEDULED },
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
  if (params.status !== "APPROVED" && params.status !== "DECLINED") {
    throw new Error("Select a valid review action");
  }
  if (params.status === "APPROVED") {
    if (existing.status !== "PENDING" && existing.status !== "DECLINED") {
      throw new Error("Only pending or declined requests can be approved");
    }
    await assertNoOverlappingTimeOffRequest({
      shopId: params.shopId,
      employeeId: existing.employeeId,
      startDate: existing.startDate,
      endDate: existing.endDate,
      excludeRequestId: existing.id,
    });
  }
  if (params.status === "DECLINED") {
    if (existing.status === "DECLINED") {
      throw new Error("This time off request has already been declined");
    }
    if (existing.status !== "PENDING" && existing.status !== "APPROVED") {
      throw new Error("This time off request cannot be declined");
    }
  }

  let cancelledShiftCount = 0;
  let restoredShiftCount = 0;
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
    } else if (existing.status === "APPROVED") {
      restoredShiftCount = await restoreShiftsCancelledForLeave(tx, {
        shopId: params.shopId,
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
      });
    }

    return request;
  });

  return { request: updated, cancelledShiftCount, restoredShiftCount };
}

export function timeOffRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) {
  return startA <= endB && endA >= startB;
}

export async function assertNoOverlappingTimeOffRequest(params: {
  shopId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
  employeeName?: string;
}) {
  const overlapping = await prisma.timeOffRequest.findFirst({
    where: {
      shopId: params.shopId,
      employeeId: params.employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: params.endDate },
      endDate: { gte: params.startDate },
      ...(params.excludeRequestId
        ? { id: { not: params.excludeRequestId } }
        : {}),
    },
  });

  if (!overlapping) return;

  const rangeLabel = `${formatLeaveDate(overlapping.startDate)} – ${formatLeaveDate(overlapping.endDate)}`;
  const statusLabel =
    overlapping.status === "APPROVED" ? "approved leave" : "a pending time off request";
  const subject = params.employeeName ?? "You";

  throw new Error(
    `${subject} already ${params.employeeName ? "has" : "have"} ${statusLabel} for overlapping dates (${rangeLabel}).`,
  );
}

export async function createApprovedTimeOffRequestForShop(params: {
  shopId: string;
  employeeId: string;
  policyId: string;
  locationId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  employeeName?: string;
}) {
  await assertNoOverlappingTimeOffRequest({
    shopId: params.shopId,
    employeeId: params.employeeId,
    startDate: params.startDate,
    endDate: params.endDate,
    employeeName: params.employeeName,
  });

  const created = await prisma.timeOffRequest.create({
    data: {
      shopId: params.shopId,
      employeeId: params.employeeId,
      policyId: params.policyId,
      locationId: params.locationId,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason ?? null,
      status: "PENDING",
    },
  });

  return approveTimeOffRequestForShop({
    shopId: params.shopId,
    requestId: created.id,
    status: "APPROVED",
  });
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
