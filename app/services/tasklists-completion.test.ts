import type { Employee } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assigneeKeyFor,
  buildAdminTaskStatusRows,
  filterAssignedEmployees,
  isTaskCompletedForViewer,
  SHARED_ASSIGNEE_KEY,
} from "./tasklists.server";

function employee(
  overrides: Partial<Employee> & Pick<Employee, "id" | "role">,
): Employee {
  return {
    shopId: "shop-1",
    locationId: null,
    firstName: "Jane",
    lastName: "Doe",
    email: null,
    phone: null,
    pinHash: "pin",
    qrCode: overrides.id,
    status: "ACTIVE",
    isShopifyStaff: true,
    firstLoginAt: null,
    hourlyRate: 0,
    position: null,
    department: null,
    locationAccess: "ALL",
    currency: "USD",
    payrollType: "HOURLY",
    salaryAmount: 0,
    weeklyAvailability: null,
    paymentMethod: "PAYPAL",
    paypalEmail: null,
    paypalAccountName: null,
    bankAccountType: null,
    bankName: null,
    accountHolderName: null,
    accountNumber: null,
    routingNumber: null,
    swiftBic: null,
    iban: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const allStaffList = {
  assignStaff: true,
  assignManagers: false,
  staffScope: "ALL",
  managerScope: "ALL",
  employeeIds: "[]",
  managerIds: "[]",
  locationAccess: "ALL",
  locationIds: "[]",
};

describe("task completion assignee keys", () => {
  it("uses an empty key for shared tasks", () => {
    expect(assigneeKeyFor(true, "emp-1")).toBe(SHARED_ASSIGNEE_KEY);
    expect(assigneeKeyFor(true)).toBe("");
  });

  it("uses the employee id for individual tasks", () => {
    expect(assigneeKeyFor(false, "emp-1")).toBe("emp-1");
  });
});

describe("POS / portal completion visibility", () => {
  it("marks a shared task done for every viewer once the shared row exists", () => {
    const completions = [{ assigneeKey: SHARED_ASSIGNEE_KEY }];
    expect(
      isTaskCompletedForViewer({
        shared: true,
        viewerEmployeeId: "jane",
        completions,
      }),
    ).toBe(true);
    expect(
      isTaskCompletedForViewer({
        shared: true,
        viewerEmployeeId: "bob",
        completions,
      }),
    ).toBe(true);
  });

  it("marks an individual task done only for that employee", () => {
    const completions = [{ assigneeKey: "jane" }];
    expect(
      isTaskCompletedForViewer({
        shared: false,
        viewerEmployeeId: "jane",
        completions,
      }),
    ).toBe(true);
    expect(
      isTaskCompletedForViewer({
        shared: false,
        viewerEmployeeId: "bob",
        completions,
      }),
    ).toBe(false);
  });
});

describe("assigned employees for individual tracking", () => {
  it("includes only active staff matching assignment and location", () => {
    const jane = employee({ id: "jane", role: "EMPLOYEE", firstName: "Jane" });
    const bob = employee({
      id: "bob",
      role: "EMPLOYEE",
      firstName: "Bob",
      status: "INACTIVE",
    });
    const manager = employee({
      id: "mgr",
      role: "STORE_MANAGER",
      firstName: "Pat",
    });

    const assigned = filterAssignedEmployees(allStaffList, [
      jane,
      bob,
      manager,
    ]);
    expect(assigned.map((row) => row.id)).toEqual(["jane"]);
  });

  it("honors selected staff and specific locations", () => {
    const jane = employee({
      id: "jane",
      role: "EMPLOYEE",
      locationId: "loc-1",
    });
    const bob = employee({
      id: "bob",
      role: "EMPLOYEE",
      locationId: "loc-2",
    });

    const assigned = filterAssignedEmployees(
      {
        ...allStaffList,
        staffScope: "SELECTED",
        employeeIds: JSON.stringify(["jane", "bob"]),
        locationAccess: "SPECIFIC",
        locationIds: JSON.stringify(["loc-1"]),
      },
      [jane, bob],
    );
    expect(assigned.map((row) => row.id)).toEqual(["jane"]);
  });
});

describe("admin task status rows", () => {
  const performedAt = new Date("2026-09-17T12:00:00.000Z");

  it("treats a shared task as done when the shared completion exists", () => {
    const [row] = buildAdminTaskStatusRows({
      items: [{ id: "task-1", title: "Sweep floor", shared: true }],
      assignedEmployees: [
        { id: "jane", firstName: "Jane", lastName: "Doe" },
        { id: "bob", firstName: "Bob", lastName: "Smith" },
      ],
      completions: [
        {
          taskItemId: "task-1",
          assigneeKey: SHARED_ASSIGNEE_KEY,
          performedBy: "Jane Doe",
          performedAt,
          notes: null,
        },
      ],
    });

    expect(row.status).toBe("completed");
    expect(row.performedBy).toBe("Jane Doe");
    expect(row.assignees).toEqual([]);
  });

  it("keeps individual status per person and completes only when everyone is done", () => {
    const [row] = buildAdminTaskStatusRows({
      items: [{ id: "task-1", title: "Close register", shared: false }],
      assignedEmployees: [
        { id: "jane", firstName: "Jane", lastName: "Doe" },
        { id: "bob", firstName: "Bob", lastName: "Smith" },
      ],
      completions: [
        {
          taskItemId: "task-1",
          assigneeKey: "jane",
          performedBy: "Jane Doe",
          performedAt,
          notes: null,
        },
      ],
    });

    expect(row.status).toBe("pending");
    expect(row.completedCount).toBe(1);
    expect(row.assigneeCount).toBe(2);
    expect(row.performedBy).toBe("1 of 2");
    expect(row.assignees.map((assignee) => assignee.status)).toEqual([
      "completed",
      "pending",
    ]);
  });

  it("marks an individual task completed when every assignee has a row", () => {
    const [row] = buildAdminTaskStatusRows({
      items: [{ id: "task-1", title: "Close register", shared: false }],
      assignedEmployees: [
        { id: "jane", firstName: "Jane", lastName: "Doe" },
        { id: "bob", firstName: "Bob", lastName: "Smith" },
      ],
      completions: [
        {
          taskItemId: "task-1",
          assigneeKey: "jane",
          performedBy: "Jane Doe",
          performedAt,
          notes: null,
        },
        {
          taskItemId: "task-1",
          assigneeKey: "bob",
          performedBy: "Bob Smith",
          performedAt,
          notes: null,
        },
      ],
    });

    expect(row.status).toBe("completed");
    expect(row.completedCount).toBe(2);
  });
});
