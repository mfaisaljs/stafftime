import type { PlanHandle } from "./plans";
import { isPlanHandle } from "./plans";
import prisma from "../../db.server";
import { shopFromDest } from "../../utils/http.server";
import { redirect } from "react-router";

export const MAX_BILLING_RETURN_URL_LENGTH = 255;

export function parseCheckoutPlanHandle(
  value: FormDataEntryValue | null,
): PlanHandle | null {
  const handle = String(value ?? "");
  if (!isPlanHandle(handle)) {
    return null;
  }
  return handle;
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

export function billingReturnUrl(request: Request, shop: string) {
  const origin = (process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");

  const billingUrl = new URL(`${origin}/app/billing`);
  billingUrl.searchParams.set("shop", shop);
  if (host) {
    billingUrl.searchParams.set("host", host);
  }
  billingUrl.searchParams.set("embedded", "1");

  return billingUrl.toString();
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
  if (!url.searchParams.get("embedded")) {
    url.searchParams.set("embedded", "1");
  }

  throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
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
  const billingUrl = new URL("/app/billing", url.origin);
  billingUrl.searchParams.set("shop", shop);
  if (host) {
    billingUrl.searchParams.set("host", host);
  }
  billingUrl.searchParams.set("embedded", "1");

  const chargeId = url.searchParams.get("charge_id");
  if (chargeId) {
    billingUrl.searchParams.set("charge_id", chargeId);
  }

  throw redirect(billingUrl.toString());
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
