import { afterEach, describe, expect, it, vi } from "vitest";
import { chatraIdentityForShop } from "./chatra-identity.server";

describe("chatraIdentityForShop", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null for empty domain", () => {
    expect(chatraIdentityForShop("")).toBeNull();
  });

  it("builds stable clientId and TruBuild-style store fields", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", "test-secret");

    const identity = chatraIdentityForShop(
      "demo.myshopify.com",
      "Demo Store",
    );

    expect(identity).toEqual({
      clientId: expect.any(String),
      shopDomain: "demo.myshopify.com",
      storeName: "Demo Store",
    });
    expect(identity?.clientId).toHaveLength(64);

    const again = chatraIdentityForShop("demo.myshopify.com", "Demo Store");
    expect(again?.clientId).toBe(identity?.clientId);
  });

  it("falls back to shop handle when store name is missing", () => {
    const identity = chatraIdentityForShop("demo.myshopify.com");
    expect(identity?.storeName).toBe("demo");
  });
});
