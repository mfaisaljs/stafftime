import { createHash } from "node:crypto";

export type ChatraIdentity = {
  clientId: string;
  shopDomain: string;
  storeName: string;
};

export function chatraIdentityForShop(
  shopDomain: string,
  storeName?: string,
): ChatraIdentity | null {
  const domain = shopDomain.trim().toLowerCase();
  if (!domain) {
    return null;
  }

  const secret =
    process.env.SHOPIFY_API_SECRET ||
    process.env.PORTAL_SESSION_SECRET ||
    "stafftime-dev";
  const store =
    storeName?.trim() || domain.replace(/\.myshopify\.com$/i, "");

  return {
    clientId: createHash("sha256")
      .update(`chatra:${domain}:${secret}`)
      .digest("hex"),
    shopDomain: domain,
    storeName: store,
  };
}
