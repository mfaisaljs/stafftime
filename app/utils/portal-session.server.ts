import { createCookie } from "react-router";
import type { EmployeeRole } from "@prisma/client";
import { normalizeShopDomain, shopDomainFromSearchParams } from "./portal-url.server";

const SESSION_MAX_AGE = 60 * 60 * 8;
const SHOP_MAX_AGE = 60 * 60 * 24 * 30;

function cookieSecret() {
  return process.env.SHOPIFY_API_SECRET || process.env.PORTAL_SESSION_SECRET || "stafftime-portal-dev";
}

const isSecure =
  process.env.NODE_ENV === "production" &&
  !String(process.env.SHOPIFY_APP_URL || "").includes("localhost");

const shopCookie = createCookie("st_portal_shop", {
  secrets: [cookieSecret()],
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SHOP_MAX_AGE,
  secure: isSecure,
});

const sessionCookie = createCookie("st_portal_session", {
  secrets: [cookieSecret()],
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
  secure: isSecure,
});

export type PortalSession = {
  shopDomain: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
};

export async function readPortalShopDomain(request: Request) {
  const url = new URL(request.url);
  const fromQuery = shopDomainFromSearchParams(url.searchParams);
  if (fromQuery) return fromQuery;

  const parsed = await shopCookie.parse(request.headers.get("Cookie"));
  if (parsed && typeof parsed === "object" && "shopDomain" in parsed) {
    return normalizeShopDomain(String(parsed.shopDomain));
  }
  return "";
}

export async function readPortalSession(request: Request) {
  const parsed = await sessionCookie.parse(request.headers.get("Cookie"));
  if (!parsed || typeof parsed !== "object") return null;
  const session = parsed as Partial<PortalSession>;
  if (!session.shopDomain || !session.employeeId || !session.firstName) {
    return null;
  }
  return session as PortalSession;
}

export async function serializePortalShopCookie(shopDomain: string) {
  return shopCookie.serialize({ shopDomain: normalizeShopDomain(shopDomain) });
}

export async function serializePortalSessionCookie(session: PortalSession) {
  return sessionCookie.serialize({
    ...session,
    shopDomain: normalizeShopDomain(session.shopDomain),
  });
}

export async function destroyPortalSessionCookie() {
  return sessionCookie.serialize("", { maxAge: 0 });
}

export async function portalRedirectHeaders(options: {
  shopDomain?: string;
  session?: PortalSession | null;
  clearSession?: boolean;
}) {
  const headers = new Headers();
  if (options.shopDomain) {
    headers.append(
      "Set-Cookie",
      await serializePortalShopCookie(options.shopDomain),
    );
  }
  if (options.clearSession) {
    headers.append("Set-Cookie", await destroyPortalSessionCookie());
  } else if (options.session) {
    headers.append(
      "Set-Cookie",
      await serializePortalSessionCookie(options.session),
    );
  }
  return headers;
}
