import { describe, expect, it } from "vitest";
import {
  isRouteErrorLike,
  serializeUnknownError,
  stringifyUnknown,
} from "./serialize-unknown-error";

describe("serializeUnknownError", () => {
  it("keeps normal Error messages", () => {
    const error = new TypeError("Cannot read pin");
    expect(serializeUnknownError(error)).toMatchObject({
      name: "TypeError",
      message: "Cannot read pin",
    });
  });

  it("serializes React Router error responses instead of [object Object]", () => {
    const error = {
      status: 500,
      statusText: "Internal Server Error",
      data: { message: "loader failed", shop: "demo.myshopify.com" },
    };
    expect(isRouteErrorLike(error)).toBe(true);
    expect(serializeUnknownError(error)).toEqual({
      name: "RouteError",
      message:
        'HTTP 500 Internal Server Error: {"message":"loader failed","shop":"demo.myshopify.com"}',
    });
  });

  it("serializes plain thrown objects", () => {
    expect(serializeUnknownError({ errors: [{ message: "throttled" }] })).toEqual({
      name: "Error",
      message: '{"errors":[{"message":"throttled"}]}',
    });
  });

  it("unpacks Error messages that are [object Object]", () => {
    const error = new Error("[object Object]");
    Object.assign(error, { status: 401, data: { error: "Unauthorized" } });
    const serialized = serializeUnknownError(error);
    expect(serialized.name).toBe("Error");
    expect(serialized.message).toContain("401");
    expect(serialized.message).toContain("Unauthorized");
    expect(serialized.message).not.toBe("[object Object]");
  });
});

describe("stringifyUnknown", () => {
  it("handles circular objects", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(stringifyUnknown(value)).toBe('{"self":"[Circular]"}');
  });
});
