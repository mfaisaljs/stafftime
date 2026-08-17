import { describe, expect, it } from "vitest";
import { resolveAppBackPath } from "./app-back-path";

describe("resolveAppBackPath", () => {
  it("returns null for top-level app routes", () => {
    expect(resolveAppBackPath("/app")).toBeNull();
    expect(resolveAppBackPath("/app/staff")).toBeNull();
    expect(resolveAppBackPath("/app/time-off")).toBeNull();
  });

  it("resolves staff sub-routes", () => {
    expect(resolveAppBackPath("/app/staff/new")).toBe("/app/staff");
    expect(resolveAppBackPath("/app/staff/emp-1")).toBe("/app/staff");
    expect(resolveAppBackPath("/app/staff/emp-1/edit")).toBe("/app/staff/emp-1");
  });

  it("resolves time off sub-routes", () => {
    expect(resolveAppBackPath("/app/time-off/new")).toBe("/app/time-off");
    expect(resolveAppBackPath("/app/time-off/policy")).toBe("/app/time-off");
    expect(resolveAppBackPath("/app/time-off/policy/new")).toBe(
      "/app/time-off/policy",
    );
    expect(resolveAppBackPath("/app/time-off/policy/pol-1")).toBe(
      "/app/time-off/policy",
    );
  });

  it("resolves payroll create route", () => {
    expect(resolveAppBackPath("/app/payroll/emp-1/create")).toBe("/app/payroll");
  });
});
