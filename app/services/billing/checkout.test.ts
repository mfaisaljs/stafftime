import { describe, expect, it } from "vitest";
import {
  billingErrorMessage,
  billingReturnUrl,
  parseCheckoutPlanHandle,
} from "./checkout";

describe("billing checkout helpers", () => {
  it("accepts all plan handles including free", () => {
    expect(parseCheckoutPlanHandle("free")).toBe("free");
    expect(parseCheckoutPlanHandle("small-business")).toBe("small-business");
    expect(parseCheckoutPlanHandle("")).toBeNull();
  });

  it("builds the billing welcome return URL with embedded context", () => {
    const request = new Request(
      "https://example.test/app/pricing?embedded=1&host=abc123",
    );
    expect(billingReturnUrl(request, "free", "test.myshopify.com")).toBe(
      "https://example.test/app/billing?plan_handle=free&shop=test.myshopify.com&host=abc123&embedded=1",
    );
    expect(billingReturnUrl(request, "workforce", "test.myshopify.com")).toBe(
      "https://example.test/app/billing?plan_handle=workforce&shop=test.myshopify.com&host=abc123&embedded=1",
    );
  });

  it("formats billing API errors", () => {
    expect(
      billingErrorMessage({
        errorData: [{ message: "Invalid return URL" }],
      }),
    ).toBe("Invalid return URL");
  });
});
