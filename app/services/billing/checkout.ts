import type { PlanHandle } from "./plans";
import { isPlanHandle } from "./plans";

export function parseCheckoutPlanHandle(
  value: FormDataEntryValue | null,
): PlanHandle | null {
  const handle = String(value ?? "");
  if (!isPlanHandle(handle)) {
    return null;
  }
  return handle;
}

export function billingReturnUrl(
  request: Request,
  planHandle: PlanHandle,
  shop: string,
  extraSeats = 0,
) {
  const origin = (process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
  const billingUrl = new URL(`${origin}/app/billing`);
  billingUrl.searchParams.set("plan_handle", planHandle);
  billingUrl.searchParams.set("shop", shop);

  if (extraSeats > 0) {
    billingUrl.searchParams.set("extra_seats", String(extraSeats));
  }

  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");
  if (host) {
    billingUrl.searchParams.set("host", host);
  }
  const embedded = requestUrl.searchParams.get("embedded");
  if (embedded) {
    billingUrl.searchParams.set("embedded", embedded);
  }

  // After approving a charge Shopify loads the return URL outside the embedded
  // iframe. exit-iframe breaks out and sends the merchant back to /app/billing.
  const exitUrl = new URL(`${origin}/auth/exit-iframe`);
  exitUrl.searchParams.set(
    "exitIframe",
    `${billingUrl.pathname}${billingUrl.search}`,
  );
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
