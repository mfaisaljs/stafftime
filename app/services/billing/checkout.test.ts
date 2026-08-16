import { describe, expect, it } from "vitest";
import {
  billingErrorMessage,
  billingReturnUrl,
  canRecordUsageWithoutCheckout,
  MAX_BILLING_RETURN_URL_LENGTH,
  isShopifyBillingTest,
  nextSubscribedExtraSeats,
  parseCheckoutPlanHandle,
  redirectSessionTokenToAdmin,
} from "./checkout";

describe("billing checkout helpers", () => {
  it("accepts all plan handles including free", () => {
    expect(parseCheckoutPlanHandle("free")).toBe("free");
    expect(parseCheckoutPlanHandle("small-business")).toBe("small-business");
    expect(parseCheckoutPlanHandle("")).toBeNull();
  });

  it("returns the merchant to Admin after charge approval", () => {
    const request = new Request(
      "https://example.test/app/pricing?embedded=1&host=abc123",
    );
    const url = billingReturnUrl(request, "test.myshopify.com");
    expect(url).toBe(
      "https://admin.shopify.com/store/test/apps/trubuild-staff-management/app/billing",
    );
    expect(url.length).toBeLessThanOrEqual(MAX_BILLING_RETURN_URL_LENGTH);
  });

  it("keeps the Admin return URL under Shopify's 255-character limit", () => {
    const url = billingReturnUrl(
      new Request("https://staff-time.onrender.com/app/pricing"),
      "spaceraceplayground.myshopify.com",
    );
    expect(url).toBe(
      "https://admin.shopify.com/store/spaceraceplayground/apps/trubuild-staff-management/app/billing",
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

  it("only skips Shopify checkout when a usage subscription already exists", () => {
    expect(
      canRecordUsageWithoutCheckout({
        alreadyOnThisPlan: true,
        seatsToAdd: 2,
        hasShopifyUsageSubscription: false,
      }),
    ).toBe(false);
    expect(
      canRecordUsageWithoutCheckout({
        alreadyOnThisPlan: true,
        seatsToAdd: 2,
        hasShopifyUsageSubscription: true,
      }),
    ).toBe(true);
  });

  it("sends billing session-token bounces back into Admin", () => {
    const request = new Request(
      "https://example.test/auth/session-token?shop=spaceraceplayground.myshopify.com&shopify-reload=https%3A%2F%2Fexample.test%2Fapp%2Fbilling%3Fembedded%3D1%26charge_id%3D123",
    );
    try {
      redirectSessionTokenToAdmin(request);
      throw new Error("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).headers.get("Location")).toBe(
        "https://admin.shopify.com/store/spaceraceplayground/apps/trubuild-staff-management/app/billing?embedded=1&charge_id=123",
      );
    }
  });

  it("redirects session-token bounces for embedded app routes into Admin", () => {
    const request = new Request(
      "https://example.test/auth/session-token?shop=spaceraceplayground.myshopify.com&shopify-reload=https%3A%2F%2Fexample.test%2Fapp%2Fstaff%2Fabc123%3Fembedded%3D1",
    );
    try {
      redirectSessionTokenToAdmin(request);
      throw new Error("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).headers.get("Location")).toBe(
        "https://admin.shopify.com/store/spaceraceplayground/apps/trubuild-staff-management/app/staff/abc123?embedded=1",
      );
    }
  });

  it("redirects usage session-token bounces into Admin", () => {
    const request = new Request(
      "https://example.test/auth/session-token?shop=spaceraceplayground.myshopify.com&shopify-reload=https%3A%2F%2Fexample.test%2Fapp%2Fusage%3Fembedded%3D1",
    );
    try {
      redirectSessionTokenToAdmin(request);
      throw new Error("expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).headers.get("Location")).toBe(
        "https://admin.shopify.com/store/spaceraceplayground/apps/trubuild-staff-management/app/usage?embedded=1",
      );
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
