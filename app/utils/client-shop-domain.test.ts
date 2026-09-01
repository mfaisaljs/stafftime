import { describe, expect, it } from "vitest";
import { shopFromHostParam } from "./client-shop-domain";

describe("shopFromHostParam", () => {
  it("decodes admin host to a myshopify domain", () => {
    const host = Buffer.from("admin.shopify.com/store/demo-shop", "utf8").toString(
      "base64",
    );
    expect(shopFromHostParam(host)).toBe("demo-shop.myshopify.com");
  });

  it("decodes legacy shop admin hosts", () => {
    const host = Buffer.from("demo-shop.myshopify.com/admin", "utf8").toString(
      "base64",
    );
    expect(shopFromHostParam(host)).toBe("demo-shop.myshopify.com");
  });
});
