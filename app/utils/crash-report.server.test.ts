import { describe, expect, it } from "vitest";
import {
  hostFromCrashInput,
  storeLabelFromDomain,
} from "./crash-report.server";

describe("crash-report shop helpers", () => {
  it("labels shops from myshopify domains", () => {
    expect(storeLabelFromDomain("demo.myshopify.com")).toBe("demo");
    expect(storeLabelFromDomain(null)).toBe("Unknown");
  });

  it("prefers session shop, then body shop, then query shop", () => {
    expect(
      hostFromCrashInput("body.myshopify.com", "session.myshopify.com", "query.myshopify.com"),
    ).toBe("session.myshopify.com");
    expect(
      hostFromCrashInput("body.myshopify.com", undefined, "query.myshopify.com"),
    ).toBe("body.myshopify.com");
    expect(hostFromCrashInput(undefined, undefined, "query.myshopify.com")).toBe(
      "query.myshopify.com",
    );
  });
});
