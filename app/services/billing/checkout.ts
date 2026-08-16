import type { PlanHandle } from "./plans";
import { isPlanHandle } from "./plans";
import prisma from "../../db.server";
import { shopFromDest } from "../../utils/http.server";

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
) {
  await prisma.shop.update({
    where: { domain: shopFromDest(shop).toLowerCase() },
    data: {
      pendingBillingPlanHandle: planHandle,
      pendingBillingExtraSeats: Math.max(0, extraSeats),
    },
  });
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

  const exitUrl = new URL(`${origin}/auth/exit-iframe`);
  exitUrl.searchParams.set("exitIframe", "/app/billing");
  exitUrl.searchParams.set("shop", shop);
  if (host) {
    exitUrl.searchParams.set("host", host);
  }

  return exitUrl.toString();
}

export function billingErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "errorData" in error) {
    const data = (error as { errorData?: unknown }).errorData;
    if (Array.isArray(data) && data.length) {
      return data
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "message" in item) {
            return String((item as { message?: string }).message ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not start Shopify checkout.";
}
