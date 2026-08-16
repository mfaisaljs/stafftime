import type { PlanHandle } from "./plans";
import { EXTRA_SEAT_MAX, getAppHandle, isPlanHandle } from "./plans";
import prisma from "../../db.server";
import { shopFromDest } from "../../utils/http.server";
import { redirect } from "react-router";

export const MAX_BILLING_RETURN_URL_LENGTH = 255;
export const MAX_EXTRA_SEATS = EXTRA_SEAT_MAX;

export function nextSubscribedExtraSeats(
  existingExtraSeats: number,
  seatsToAdd: number,
  maxExtraSeats = MAX_EXTRA_SEATS,
) {
  const existing = Math.max(0, Math.floor(existingExtraSeats));
  const add = Math.max(0, Math.floor(seatsToAdd));
  return Math.min(maxExtraSeats, existing + add);
}

const DEV_BILLING_TEST_SHOP = "spaceraceplayground";

export function canRecordUsageWithoutCheckout(params: {
  alreadyOnThisPlan: boolean;
  seatsToAdd: number;
  hasShopifyUsageSubscription: boolean;
}) {
  return (
    params.alreadyOnThisPlan &&
    params.seatsToAdd > 0 &&
    params.hasShopifyUsageSubscription
  );
}

const USAGE_SUBSCRIPTION_QUERY = `#graphql
  query HasShopifyUsageSubscription {
    currentAppInstallation {
      activeSubscriptions {
        status
        lineItems {
          plan {
            pricingDetails {
              __typename
            }
          }
        }
      }
    }
  }
`;

export async function hasActiveShopifyUsageSubscription(admin: {
  graphql: (query: string) => Promise<Response>;
}) {
  try {
    const response = await admin.graphql(USAGE_SUBSCRIPTION_QUERY);
    const payload = (await response.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{
            status?: string;
            lineItems?: Array<{
              plan?: { pricingDetails?: { __typename?: string } };
            }>;
          }>;
        };
      };
    };
    return (
      payload.data?.currentAppInstallation?.activeSubscriptions?.some(
        (subscription) =>
          subscription.status === "ACTIVE" &&
          subscription.lineItems?.some(
            (item) => item.plan?.pricingDetails?.__typename === "AppUsagePricing",
          ),
      ) ?? false
    );
  } catch {
    return false;
  }
}

export function isShopifyBillingTest(shop: string) {
  const domain = shopFromDest(shop).toLowerCase();
  if (
    domain === DEV_BILLING_TEST_SHOP ||
    domain.startsWith(`${DEV_BILLING_TEST_SHOP}.`)
  ) {
    return true;
  }
  return process.env.SHOPIFY_BILLING_TEST !== "false";
}

export function parseCheckoutPlanHandle(
  value: FormDataEntryValue | null,
): PlanHandle | null {
  const handle = String(value ?? "");
  if (!isPlanHandle(handle)) {
    return null;
  }
  return handle;
}

export async function saveSubscribedExtraSeats(shop: string, extraSeats: number) {
  await prisma.shop.update({
    where: { domain: shopFromDest(shop).toLowerCase() },
    data: { reportedStaffUsage: Math.max(0, extraSeats) },
  });
}

export async function savePendingBillingCheckout(
  shop: string,
  planHandle: PlanHandle,
  extraSeats: number,
  host: string | null,
) {
  await prisma.shop.update({
    where: { domain: shopFromDest(shop).toLowerCase() },
    data: {
      pendingBillingPlanHandle: planHandle,
      pendingBillingExtraSeats: Math.max(0, extraSeats),
      pendingBillingHost: host,
    },
  });
}

export async function getPendingBillingHost(shop: string) {
  const record = await prisma.shop.findUnique({
    where: { domain: shopFromDest(shop).toLowerCase() },
    select: { pendingBillingHost: true },
  });
  return record?.pendingBillingHost ?? null;
}

export async function takePendingBillingCheckout(shop: string) {
  const domain = shopFromDest(shop).toLowerCase();
  const record = await prisma.shop.findUnique({ where: { domain } });
  if (!record?.pendingBillingPlanHandle) {
    return null;
  }

  const pending = {
    planHandle: record.pendingBillingPlanHandle as PlanHandle,
    extraSeats: record.pendingBillingExtraSeats ?? 0,
  };

  await prisma.shop.update({
    where: { domain },
    data: {
      pendingBillingPlanHandle: null,
      pendingBillingExtraSeats: null,
      pendingBillingHost: null,
    },
  });

  return pending;
}

export function shopifyAdminAppUrl(shop: string, appPath = "/app/billing") {
  const store = shopFromDest(shop)
    .replace(/\.myshopify\.com$/i, "")
    .toLowerCase();
  const appHandle = getAppHandle();
  const path = appPath.startsWith("/") ? appPath : `/${appPath}`;
  return `https://admin.shopify.com/store/${store}/apps/${appHandle}${path}`;
}

export function billingReturnUrl(_request: Request, shop: string) {
  return shopifyAdminAppUrl(shop, "/app/billing");
}

/** Shopify often drops host on billing return; restore from pending checkout. */
export async function restoreEmbeddedBillingParams(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("host")) {
    return;
  }

  const shop = url.searchParams.get("shop");
  if (!shop) {
    return;
  }

  const host = await getPendingBillingHost(shop);
  if (!host) {
    return;
  }

  url.searchParams.set("host", host);
  throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

/** After billing approval, send the merchant back into Admin instead of a blank 200. */
export function redirectSessionTokenToAdmin(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/auth/session-token")) {
    return;
  }

  const shop = url.searchParams.get("shop");
  if (!shop) {
    return;
  }

  const reload = url.searchParams.get("shopify-reload");
  if (!reload) {
    return;
  }

  let reloadUrl: URL;
  try {
    reloadUrl = new URL(reload, url.origin);
  } catch {
    return;
  }

  const isAppReload =
    reloadUrl.pathname === "/app" || reloadUrl.pathname.startsWith("/app/");
  if (!isAppReload) {
    return;
  }

  throw redirect(
    shopifyAdminAppUrl(shop, `${reloadUrl.pathname}${reloadUrl.search}`),
  );
}

/** Legacy exit-iframe returns: redirect straight to /app/billing with embedded params. */
export async function redirectBillingExitIframe(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/auth/exit-iframe")) {
    return;
  }

  const shop = url.searchParams.get("shop");
  if (!shop) {
    return;
  }

  const host =
    url.searchParams.get("host") ?? (await getPendingBillingHost(shop));
  const chargeId = url.searchParams.get("charge_id");
  const search = new URLSearchParams();
  search.set("shop", shop);
  if (host) {
    search.set("host", host);
  }
  if (chargeId) {
    search.set("charge_id", chargeId);
  }

  throw redirect(shopifyAdminAppUrl(shop, `/app/billing?${search.toString()}`));
}

export function billingErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "errorData" in error) {
    const data = (error as { errorData?: unknown }).errorData;
    if (Array.isArray(data) && data.length) {
      const message = data
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "message" in item) {
            return String((item as { message?: string }).message ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
      if (message) {
        return message;
      }
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not start Shopify checkout.";
}
