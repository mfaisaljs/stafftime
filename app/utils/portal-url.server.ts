import { shopFromDest } from "./http.server";

export function normalizeShopDomain(raw: string | null | undefined) {
  if (!raw) return "";
  return shopFromDest(raw).toLowerCase().replace(/\/$/, "");
}

export function portalHostFromEnv() {
  const explicit = process.env.PORTAL_HOST?.trim().toLowerCase();
  if (explicit) return explicit.replace(/:\d+$/, "");

  const portalUrl = process.env.PORTAL_URL?.trim();
  if (!portalUrl) return null;
  try {
    const url = new URL(
      portalUrl.includes("://") ? portalUrl : `https://${portalUrl}`,
    );
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isPortalHost(request: Request) {
  const expected = portalHostFromEnv();
  if (!expected) return false;

  let appHost = "";
  try {
    appHost = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
      .hostname.toLowerCase();
  } catch {
    appHost = "";
  }
  // Path-based portal on the app origin should not steal Shopify's `/` → `/app`.
  if (appHost && expected === appHost) return false;

  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  return Boolean(host && host === expected);
}

export function publicPortalUrl(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);
  const explicit = process.env.PORTAL_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    const url = new URL(
      explicit.includes("://") ? explicit : `https://${explicit}`,
    );
    url.searchParams.set("ShopDomain", domain);
    return url.toString();
  }

  const appUrl = (process.env.SHOPIFY_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = new URL("/portal", `${appUrl}/`);
  url.searchParams.set("ShopDomain", domain);
  return url.toString();
}
