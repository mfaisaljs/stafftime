import { redirect } from "react-router";
import type { PortalFeatureKey } from "./portal-path";
import { portalHref } from "./portal-path";
import {
  portalRedirectHeaders,
  readPortalSession,
  readPortalShopDomain,
} from "./portal-session.server";
import {
  assertPortalFeature,
  loadPortalEmployee,
  loadPortalShop,
} from "../services/portal.server";

export async function loadPortalHome(request: Request) {
  const shopDomain = await readPortalShopDomain(request);
  if (!shopDomain) {
    return {
      shopDomain: "",
      shopName: "",
      locationName: "",
      features: [] as Awaited<ReturnType<typeof loadPortalShop>>["features"],
      error: "Open this portal from the staff link in Settings.",
    };
  }

  try {
    const payload = await loadPortalShop(shopDomain);
    return {
      shopDomain: payload.shop.domain,
      shopName: payload.shop.name || payload.shop.domain,
      locationName: payload.locationName,
      features: payload.features,
      error: null as string | null,
    };
  } catch (error) {
    return {
      shopDomain,
      shopName: "",
      locationName: "",
      features: [] as Awaited<ReturnType<typeof loadPortalShop>>["features"],
      error:
        error instanceof Error
          ? error.message
          : "This shop does not have a StaffTime portal.",
    };
  }
}

export async function requirePortalFeature(
  request: Request,
  feature: PortalFeatureKey,
) {
  const shopDomain = await readPortalShopDomain(request);
  if (!shopDomain) {
    throw redirect("/portal");
  }

  const session = await readPortalSession(request);
  if (!session || session.shopDomain !== shopDomain) {
    throw redirect(
      portalHref("/portal", shopDomain, { unlock: feature }),
      { headers: await portalRedirectHeaders({ shopDomain, clearSession: true }) },
    );
  }

  try {
    const context = await loadPortalEmployee({
      shopDomain,
      employeeId: session.employeeId,
    });
    assertPortalFeature(context.settings, feature, context.employee.role);
    return context;
  } catch {
    throw redirect(
      portalHref("/portal", shopDomain, { unlock: feature }),
      { headers: await portalRedirectHeaders({ shopDomain, clearSession: true }) },
    );
  }
}
