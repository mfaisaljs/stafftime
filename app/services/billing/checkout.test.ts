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
      "https://example.test/auth/exit-iframe?exitIframe=%2Fapp%2Fbilling%3Fplan_handle%3Dfree%26shop%3Dtest.myshopify.com%26host%3Dabc123%26embedded%3D1&shop=test.myshopify.com&host=abc123",
    );
    expect(billingReturnUrl(request, "workforce", "test.myshopify.com")).toBe(
      "https://example.test/auth/exit-iframe?exitIframe=%2Fapp%2Fbilling%3Fplan_handle%3Dworkforce%26shop%3Dtest.myshopify.com%26host%3Dabc123%26embedded%3D1&shop=test.myshopify.com&host=abc123",
    );
    expect(
      billingReturnUrl(request, "free", "test.myshopify.com", 2),
    ).toBe(
      "https://example.test/auth/exit-iframe?exitIframe=%2Fapp%2Fbilling%3Fplan_handle%3Dfree%26shop%3Dtest.myshopify.com%26extra_seats%3D2%26host%3Dabc123%26embedded%3D1&shop=test.myshopify.com&host=abc123",
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
