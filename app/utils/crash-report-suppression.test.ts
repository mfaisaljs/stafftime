import { describe, expect, it } from "vitest";
import {
  isSuppressedApplicationCrashMessage,
  isSuppressedClientCrash,
} from "./crash-report-suppression";

describe("isSuppressedApplicationCrashMessage", () => {
  it("suppresses React hydration mismatch codes including #425", () => {
    expect(
      isSuppressedApplicationCrashMessage(
        "Minified React error #425; visit https://reactjs.org/docs/error-decoder.html?invariant=425",
      ),
    ).toBe(true);
    expect(isSuppressedApplicationCrashMessage("Minified React error #418")).toBe(
      true,
    );
    expect(isSuppressedApplicationCrashMessage("Minified React error #423")).toBe(
      true,
    );
  });

  it("does not suppress unrelated errors", () => {
    expect(
      isSuppressedApplicationCrashMessage(
        "TypeError: Cannot read properties of null",
      ),
    ).toBe(false);
  });

  it("suppresses Shopify session-token auth status codes", () => {
    expect(
      isSuppressedApplicationCrashMessage(
        'HTTP 401 Unauthorized: {"error":"Unauthorized"}',
      ),
    ).toBe(true);
    expect(isSuppressedApplicationCrashMessage("HTTP 302 Found")).toBe(true);
    expect(
      isSuppressedApplicationCrashMessage(
        'HTTP 500 Internal Server Error: {"message":"loader failed"}',
      ),
    ).toBe(false);
  });
});

describe("isSuppressedClientCrash", () => {
  it("suppresses client route errors in the 3xx/4xx range", () => {
    expect(
      isSuppressedClientCrash(
        { status: 401, data: { error: "Unauthorized" } },
        "HTTP 401",
      ),
    ).toBe(true);
    expect(
      isSuppressedClientCrash(
        { status: 500, data: { message: "loader failed" } },
        'HTTP 500 Internal Server Error: {"message":"loader failed"}',
      ),
    ).toBe(false);
  });
});
