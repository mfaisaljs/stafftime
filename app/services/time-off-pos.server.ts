import type { Employee, EmployeeRole } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop } from "./workforce.server";
import { isManagerRole } from "./settings.server";
import {
  approveTimeOffRequestForShop,
  assertNoOverlappingTimeOffRequest,
  findOverlappingScheduledShifts,
  summarizeOverlappingShifts,
} from "./time-off-shifts.server";

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value)).filter(Boolean);
  } catch {
    return [];
  }
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function roleBadgeLabel(
  role: EmployeeRole,
  position: string | null | undefined,
) {
  if (position?.trim()) return position.trim();
  switch (role) {
    case "OWNER":
      return "Owner";
    case "REGIONAL_MANAGER":
      return "Regional Manager";
    case "STORE_MANAGER":
      return "Manager";
    case "SUPERVISOR":
      return "Supervisor";
    default:
      return "Staff";
  }
}

function policyAssignedToEmployee(
  employeeIdsJson: string,
  employeeId: string,
) {
  const ids = parseIds(employeeIdsJson);
  return ids.length === 0 || ids.includes(employeeId);
}

function statusTone(
  status: string,
): "warning" | "success" | "critical" | "neutral" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "success";
    case "DECLINED":
      return "critical";
    default:
      return "neutral";
  }
}

function mapRequest(
  request: {
    id: string;
    employeeId: string;
    startDate: string;
    endDate: string;
    reason: string | null;
    status: string;
    createdAt: Date;
    policy: { id: string; name: string; compensation: string };
  },
  employeeNameById: Map<string, string>,
  overlappingShiftCount = 0,
  overlappingShifts: Array<{
    id: string;
    dateKey: string;
    startTime: string;
    endTime: string;
    locationName: string;
  }> = [],
) {
  return {
    id: request.id,
    employeeId: request.employeeId,
    employeeName: employeeNameById.get(request.employeeId) ?? "Unknown staff",
    policyId: request.policy.id,
    policyName: request.policy.name,
    compensation: request.policy.compensation,
    startDate: request.startDate,
    endDate: request.endDate,
    reason: request.reason ?? "",
    status: request.status,
    statusLabel:
      request.status.charAt(0) + request.status.slice(1).toLowerCase(),
    tone: statusTone(request.status),
    createdAt: request.createdAt.toISOString(),
    overlappingShiftCount,
    overlappingShifts,
  };
}

async function getActor(shopDomain: string, employeeId: string) {
  const shop = await ensureShop(shopDomain);
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      shopId: shop.id,
      status: { not: "ARCHIVED" },
    },
  });
  if (!employee) throw new Error("Employee not found");
  return { shop, employee };
}

export async function getTimeOffBootstrapForPos(params: {
  shopDomain: string;
  employeeId: string;
}) {
  const { shop, employee } = await getActor(
    params.shopDomain,
    params.employeeId,
  );
  const canApprove = isManagerRole(employee.role);

  const [policies, myRequests, staff, pendingRequests, approvedRequests] =
    await Promise.all([
    prisma.timeOffPolicy.findMany({
      where: { shopId: shop.id, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeOffRequest.findMany({
      where: { shopId: shop.id, employeeId: employee.id },
      include: { policy: true },
      orderBy: { createdAt: "desc" },
    }),
    canApprove
      ? prisma.employee.findMany({
          where: {
            shopId: shop.id,
            status: { not: "ARCHIVED" },
            id: { not: employee.id },
          },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            position: true,
          },
        })
      : Promise.resolve([] as Array<
          Pick<Employee, "id" | "firstName" | "lastName" | "role" | "position">
        >),
    canApprove
      ? prisma.timeOffRequest.findMany({
          where: { shopId: shop.id, status: "PENDING" },
          include: { policy: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    canApprove
      ? prisma.timeOffRequest.findMany({
          where: { shopId: shop.id, status: "APPROVED" },
          include: { policy: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const pendingWithConflicts = canApprove
    ? await Promise.all(
        pendingRequests.map(async (request) => {
          const overlapping = await findOverlappingScheduledShifts({
            shopId: shop.id,
            employeeId: request.employeeId,
            startDate: request.startDate,
            endDate: request.endDate,
          });
          return {
            request,
            overlappingShiftCount: overlapping.length,
            overlappingShifts: summarizeOverlappingShifts(overlapping),
          };
        }),
      )
    : [];

  const employeeNameById = new Map<string, string>([
    [employee.id, `${employee.firstName} ${employee.lastName}`.trim()],
    ...staff.map(
      (item) =>
        [item.id, `${item.firstName} ${item.lastName}`.trim()] as [
          string,
          string,
        ],
    ),
  ]);

  // Resolve names for pending/approved requesters who may not be in staff list (edge).
  if (canApprove && (pendingRequests.length > 0 || approvedRequests.length > 0)) {
    const missingIds = [...pendingRequests, ...approvedRequests]
      .map((item) => item.employeeId)
      .filter((id) => !employeeNameById.has(id));
    if (missingIds.length > 0) {
      const extras = await prisma.employee.findMany({
        where: { shopId: shop.id, id: { in: missingIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const item of extras) {
        employeeNameById.set(
          item.id,
          `${item.firstName} ${item.lastName}`.trim(),
        );
      }
    }
  }

  const availablePolicies = policies
    .filter((policy) =>
      policyAssignedToEmployee(policy.employeeIds, employee.id),
    )
    .map((policy) => ({
      id: policy.id,
      name: policy.name,
      compensation: policy.compensation,
      policyType: policy.policyType,
    }));

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      roleLabel: roleBadgeLabel(employee.role, employee.position),
      canApprove,
    },
    policies: availablePolicies,
    myRequests: myRequests.map((request) =>
      mapRequest(request, employeeNameById),
    ),
    staff: staff.map((item) => ({
      id: item.id,
      name: `${item.firstName} ${item.lastName}`.trim(),
      roleLabel: roleBadgeLabel(item.role, item.position),
    })),
    pendingApprovals: pendingWithConflicts.map(({ request, overlappingShiftCount, overlappingShifts }) =>
      mapRequest(request, employeeNameById, overlappingShiftCount, overlappingShifts),
    ),
    approvedApprovals: approvedRequests.map((request) =>
      mapRequest(request, employeeNameById),
    ),
    serverTime: Date.now(),
  };
}

export async function createTimeOffRequestForPos(params: {
  shopDomain: string;
  employeeId: string;
  policyId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) {
  const { shop, employee } = await getActor(
    params.shopDomain,
    params.employeeId,
  );

  if (!isDateKey(params.startDate) || !isDateKey(params.endDate)) {
    throw new Error("Select a valid start and end date");
  }
  if (params.endDate < params.startDate) {
    throw new Error("End date must be on or after start date");
  }
  if (!params.policyId) {
    throw new Error("Select a policy");
  }

  const policy = await prisma.timeOffPolicy.findFirst({
    where: { id: params.policyId, shopId: shop.id, active: true },
  });
  if (!policy) throw new Error("Selected policy was not found");
  if (!policyAssignedToEmployee(policy.employeeIds, employee.id)) {
    throw new Error("This policy is not available for you");
  }

  let locationId = employee.locationId;
  if (!locationId) {
    const fallback = await prisma.storeLocation.findFirst({
      where: { shopId: shop.id, active: true },
      orderBy: { name: "asc" },
    });
    locationId = fallback?.id ?? null;
  }
  if (!locationId) {
    throw new Error("No location available for this request");
  }

  await assertNoOverlappingTimeOffRequest({
    shopId: shop.id,
    employeeId: employee.id,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  const created = await prisma.timeOffRequest.create({
    data: {
      shopId: shop.id,
      employeeId: employee.id,
      policyId: policy.id,
      locationId,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason?.trim() || null,
      status: "PENDING",
    },
    include: { policy: true },
  });

  const employeeNameById = new Map([
    [employee.id, `${employee.firstName} ${employee.lastName}`.trim()],
  ]);

  return {
    request: mapRequest(created, employeeNameById),
  };
}

export async function listStaffTimeOffForPos(params: {
  shopDomain: string;
  employeeId: string;
  targetEmployeeId: string;
}) {
  const { shop, employee } = await getActor(
    params.shopDomain,
    params.employeeId,
  );
  if (!isManagerRole(employee.role)) {
    throw new Error("Only managers can view staff requests");
  }

  const target = await prisma.employee.findFirst({
    where: {
      id: params.targetEmployeeId,
      shopId: shop.id,
      status: { not: "ARCHIVED" },
    },
  });
  if (!target) throw new Error("Staff member not found");

  const requests = await prisma.timeOffRequest.findMany({
    where: { shopId: shop.id, employeeId: target.id },
    include: { policy: true },
    orderBy: { createdAt: "desc" },
  });

  const employeeNameById = new Map([
    [target.id, `${target.firstName} ${target.lastName}`.trim()],
  ]);

  return {
    target: {
      id: target.id,
      name: `${target.firstName} ${target.lastName}`.trim(),
      roleLabel: roleBadgeLabel(target.role, target.position),
    },
    requests: requests.map((request) => mapRequest(request, employeeNameById)),
  };
}

export async function reviewTimeOffRequestForPos(params: {
  shopDomain: string;
  employeeId: string;
  requestId: string;
  status: "APPROVED" | "DECLINED";
}) {
  const { shop, employee } = await getActor(
    params.shopDomain,
    params.employeeId,
  );
  if (!isManagerRole(employee.role)) {
    throw new Error("Only managers can approve or decline requests");
  }

  const { request: updated, cancelledShiftCount, restoredShiftCount } =
    await approveTimeOffRequestForShop({
      shopId: shop.id,
      requestId: params.requestId,
      status: params.status,
    });

  const requester = await prisma.employee.findFirst({
    where: { id: updated.employeeId, shopId: shop.id },
    select: { firstName: true, lastName: true },
  });
  const employeeNameById = new Map([
    [
      updated.employeeId,
      requester
        ? `${requester.firstName} ${requester.lastName}`.trim()
        : "Unknown staff",
    ],
  ]);

  const message =
    params.status === "APPROVED"
      ? cancelledShiftCount > 0
        ? `Time off approved. ${cancelledShiftCount} overlapping shift${cancelledShiftCount === 1 ? "" : "s"} cancelled.`
        : "Time off approved"
      : restoredShiftCount > 0
        ? `Time off declined. ${restoredShiftCount} shift${restoredShiftCount === 1 ? "" : "s"} restored.`
        : "Time off declined";

  return {
    request: mapRequest(updated, employeeNameById),
    cancelledShiftCount,
    restoredShiftCount,
    message,
  };
}
