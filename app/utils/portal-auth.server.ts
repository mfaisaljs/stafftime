import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import type { PortalFeatureKey } from "./portal-path";
import { isPortalFeatureKey, PORTAL_FEATURE_PATHS, portalHref } from "./portal-path";
import {
  portalRedirectHeaders,
  readPortalSession,
  readPortalShopDomain,
} from "./portal-session.server";
import {
  assertPortalFeature,
  loadPortalEmployee,
  loadPortalShop,
  toPortalSessionEmployee,
  verifyPortalPin,
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

export async function handlePortalAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const shopDomain = await readPortalShopDomain(request);

  if (intent === "home") {
    throw redirect(portalHref("/portal", shopDomain), {
      headers: await portalRedirectHeaders({
        shopDomain,
        clearSession: true,
      }),
    });
  }

  if (intent !== "pin") {
    return { error: "Unknown action." };
  }

  const pin = String(formData.get("pin") ?? "");
  const next = String(formData.get("next") ?? "");
  const feature = isPortalFeatureKey(next) ? next : undefined;
  if (!feature) {
    return { error: "Select an action first." };
  }

  try {
    const result = await verifyPortalPin({
      shopDomain,
      pin,
      feature,
    });
    throw redirect(portalHref(PORTAL_FEATURE_PATHS[feature], result.shop.domain), {
      headers: await portalRedirectHeaders({
        shopDomain: result.shop.domain,
        session: toPortalSessionEmployee(result.shop.domain, result.employee),
      }),
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: error instanceof Error ? error.message : "Invalid PIN",
    };
  }
}
