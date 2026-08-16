import { describe, expect, it } from "vitest";
import {
  billingErrorMessage,
  billingReturnUrl,
  MAX_BILLING_RETURN_URL_LENGTH,
  isShopifyBillingTest,
  nextSubscribedExtraSeats,
  parseCheckoutPlanHandle,
} from "./checkout";

describe("billing checkout helpers", () => {
  it("accepts all plan handles including free", () => {
    expect(parseCheckoutPlanHandle("free")).toBe("free");
    expect(parseCheckoutPlanHandle("small-business")).toBe("small-business");
    expect(parseCheckoutPlanHandle("")).toBeNull();
  });

  it("returns the merchant to Admin after charge approval", () => {
    const previousKey = process.env.SHOPIFY_API_KEY;
    process.env.SHOPIFY_API_KEY = "test-api-key";
    const request = new Request(
      "https://example.test/app/pricing?embedded=1&host=abc123",
    );
    const url = billingReturnUrl(request, "test.myshopify.com");
    if (previousKey) {
      process.env.SHOPIFY_API_KEY = previousKey;
    } else {
      delete process.env.SHOPIFY_API_KEY;
    }
    expect(url).toBe(
      "https://admin.shopify.com/store/test/apps/test-api-key/app/billing",
    );
    expect(url.length).toBeLessThanOrEqual(MAX_BILLING_RETURN_URL_LENGTH);
  });

  it("keeps the Admin return URL under Shopify's 255-character limit", () => {
    const previousKey = process.env.SHOPIFY_API_KEY;
    process.env.SHOPIFY_API_KEY = "94ec09cf3eaee34d49da7c9a2e1b91cd";
    const url = billingReturnUrl(
      new Request("https://staff-time.onrender.com/app/pricing"),
      "spaceraceplayground.myshopify.com",
    );
    if (previousKey) {
      process.env.SHOPIFY_API_KEY = previousKey;
    }
    expect(url).toBe(
      "https://admin.shopify.com/store/spaceraceplayground/apps/94ec09cf3eaee34d49da7c9a2e1b91cd/app/billing",
    );
    expect(url.length).toBeLessThanOrEqual(MAX_BILLING_RETURN_URL_LENGTH);
  });

  it("adds slider extras on top of already subscribed extras", () => {
    expect(nextSubscribedExtraSeats(1, 1)).toBe(2);
    expect(nextSubscribedExtraSeats(0, 1)).toBe(1);
    expect(nextSubscribedExtraSeats(49, 5)).toBe(50);
  });

  it("forces test billing on spaceraceplayground and otherwise uses SHOPIFY_BILLING_TEST", () => {
    const previous = process.env.SHOPIFY_BILLING_TEST;
    process.env.SHOPIFY_BILLING_TEST = "false";
    expect(isShopifyBillingTest("spaceraceplayground.myshopify.com")).toBe(true);
    expect(isShopifyBillingTest("other-store.myshopify.com")).toBe(false);
    process.env.SHOPIFY_BILLING_TEST = "true";
    expect(isShopifyBillingTest("other-store.myshopify.com")).toBe(true);
    if (previous === undefined) {
      delete process.env.SHOPIFY_BILLING_TEST;
    } else {
      process.env.SHOPIFY_BILLING_TEST = previous;
    }
  });

  it("formats billing API errors", () => {
    expect(
      billingErrorMessage({
        errorData: [{ message: "Invalid return URL" }],
      }),
    ).toBe("Invalid return URL");
  });
});
