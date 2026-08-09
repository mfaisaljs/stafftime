import { describe, expect, it } from "vitest";

type MissedPunchStatus = "PENDING" | "APPROVED" | "REJECTED";

type MissedPunchRequest = {
  id: string;
  status: MissedPunchStatus;
  type: "CLOCK_IN" | "CLOCK_OUT";
  requestedAt: Date;
};

function canReview(request: MissedPunchRequest) {
  return request.status === "PENDING";
}

function applyApproval(
  request: MissedPunchRequest,
  decision: "APPROVED" | "REJECTED",
): MissedPunchRequest {
  if (!canReview(request)) {
    throw new Error("Request has already been reviewed");
  }

  return {
    ...request,
    status: decision,
  };
}

function shouldCreateTimeEntry(
  request: MissedPunchRequest,
  decision: "APPROVED" | "REJECTED",
) {
  return decision === "APPROVED" && request.type === "CLOCK_IN";
}

describe("approval workflow", () => {
  it("allows review only for pending requests", () => {
    const pending: MissedPunchRequest = {
      id: "req-1",
      status: "PENDING",
      type: "CLOCK_IN",
      requestedAt: new Date("2026-08-09T09:00:00.000Z"),
    };

    expect(canReview(pending)).toBe(true);
    expect(canReview({ ...pending, status: "APPROVED" })).toBe(false);
  });

  it("prevents double review", () => {
    const approved: MissedPunchRequest = {
      id: "req-1",
      status: "APPROVED",
      type: "CLOCK_OUT",
      requestedAt: new Date("2026-08-09T17:00:00.000Z"),
    };

    expect(() => applyApproval(approved, "REJECTED")).toThrow(
      "Request has already been reviewed",
    );
  });

  it("creates time entry only for approved clock-in requests", () => {
    const request: MissedPunchRequest = {
      id: "req-1",
      status: "PENDING",
      type: "CLOCK_IN",
      requestedAt: new Date("2026-08-09T09:00:00.000Z"),
    };

    expect(shouldCreateTimeEntry(request, "APPROVED")).toBe(true);
    expect(shouldCreateTimeEntry(request, "REJECTED")).toBe(false);
    expect(
      shouldCreateTimeEntry({ ...request, type: "CLOCK_OUT" }, "APPROVED"),
    ).toBe(false);
  });
});
