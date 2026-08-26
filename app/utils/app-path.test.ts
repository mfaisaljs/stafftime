import { describe, expect, it } from "vitest";
import { mergeAppSearchParams } from "./app-path";

describe("mergeAppSearchParams", () => {
  it("preserves embedded Shopify params from the current URL", () => {
    const current = new URLSearchParams(
      "tab=commission&days=30&embedded=1&host=abc&shop=test.myshopify.com",
    );

    expect(mergeAppSearchParams("/app/staff/emp1?days=30", current)).toBe(
      "/app/staff/emp1?days=30&embedded=1&host=abc&shop=test.myshopify.com",
    );
  });

  it("does not re-add route params removed from the target path", () => {
    const current = new URLSearchParams(
      "tab=commission&embedded=1&shop=test.myshopify.com",
    );

    expect(mergeAppSearchParams("/app/staff/emp1?days=30", current)).toBe(
      "/app/staff/emp1?days=30&embedded=1&shop=test.myshopify.com",
    );
  });

  it("lets the target path override preserved params", () => {
    const current = new URLSearchParams("embedded=1&shop=old.myshopify.com");

    expect(
      mergeAppSearchParams(
        "/app/staff/emp1?embedded=1&shop=new.myshopify.com",
        current,
      ),
    ).toBe("/app/staff/emp1?embedded=1&shop=new.myshopify.com");
  });
});
