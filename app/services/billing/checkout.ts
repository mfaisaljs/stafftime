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
) {
  const origin = (process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
  const url = new URL(`${origin}/app/billing`);
  url.searchParams.set("plan_handle", planHandle);
  url.searchParams.set("shop", shop);

  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");
  if (host) {
    url.searchParams.set("host", host);
  }
  const embedded = requestUrl.searchParams.get("embedded");
  if (embedded) {
    url.searchParams.set("embedded", embedded);
  }

  return url.toString();
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
