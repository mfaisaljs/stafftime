import { describe, expect, it } from "vitest";
import {
  billingErrorMessage,
  billingReturnUrl,
  MAX_BILLING_RETURN_URL_LENGTH,
  parseCheckoutPlanHandle,
} from "./checkout";

describe("billing checkout helpers", () => {
  it("accepts all plan handles including free", () => {
    expect(parseCheckoutPlanHandle("free")).toBe("free");
    expect(parseCheckoutPlanHandle("small-business")).toBe("small-business");
    expect(parseCheckoutPlanHandle("")).toBeNull();
  });

  it("builds a short exit-iframe billing return URL with embedded context", () => {
    const previousAppUrl = process.env.SHOPIFY_APP_URL;
    delete process.env.SHOPIFY_APP_URL;
    const request = new Request(
      "https://example.test/app/pricing?embedded=1&host=abc123",
    );
    const url = billingReturnUrl(request, "test.myshopify.com");
    if (previousAppUrl) {
      process.env.SHOPIFY_APP_URL = previousAppUrl;
    }
    expect(url).toBe(
      "https://example.test/auth/exit-iframe?exitIframe=%2Fapp%2Fbilling&shop=test.myshopify.com&host=abc123",
    );
    expect(url.length).toBeLessThanOrEqual(MAX_BILLING_RETURN_URL_LENGTH);
  });

  it("keeps return URL under Shopify limit with ngrok and long host", () => {
    const request = new Request(
      "https://staff-time.onrender.com/app/pricing?embedded=1&host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvc3BhY2VyYWNlcGxheWdyb3VuZA",
    );
    const url = billingReturnUrl(
      request,
      "spaceraceplayground.myshopify.com",
    );
    expect(url.length).toBeLessThanOrEqual(MAX_BILLING_RETURN_URL_LENGTH);
  });

  it("formats billing API errors", () => {
    expect(
      billingErrorMessage({
        errorData: [{ message: "Invalid return URL" }],
      }),
    ).toBe("Invalid return URL");
  });
});
