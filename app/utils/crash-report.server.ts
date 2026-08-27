import { emailService } from "../services/email.server";
import { shopDomainFromSearchParams } from "./portal-url.server";
import { readPortalShopDomain } from "./portal-session.server";

export function storeLabelFromDomain(shop: string | null | undefined): string {
  if (!shop) return "Unknown";
  return shop.replace(/\.myshopify\.com$/i, "") || shop;
}

export async function resolveShopFromCrashRequest(
  request: Request,
): Promise<string | undefined> {
  try {
    const url = new URL(request.url);
    const fromQuery = shopDomainFromSearchParams(url.searchParams);
    if (fromQuery) return fromQuery;
  } catch {
    // ignore invalid request URL
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const fromReferer = shopDomainFromSearchParams(
        new URL(referer).searchParams,
      );
      if (fromReferer) return fromReferer;
    } catch {
      // ignore invalid referer
    }
  }

  try {
    const portalShop = await readPortalShopDomain(request);
    if (portalShop) return portalShop;
  } catch {
    // ignore portal cookie parse failures
  }

  return undefined;
}

export function hostFromCrashInput(
  input: string | undefined,
  sessionShop: string | undefined,
  queryShop: string | null,
): string | undefined {
  if (sessionShop) return sessionShop;
  if (input && (input.includes(".") || input.includes("myshopify"))) {
    return input.trim();
  }
  if (queryShop) return queryShop;
  return undefined;
}

export async function reportServerCrash(
  error: Error,
  request: Request,
): Promise<void> {
  const url = new URL(request.url);
  const shopFromQuery = shopDomainFromSearchParams(url.searchParams);
  const shop =
    (await resolveShopFromCrashRequest(request)) || shopFromQuery || undefined;
  await emailService.sendApplicationCrashReport({
    source: "server",
    shopDomain: shop,
    storeName: storeLabelFromDomain(shop ?? null),
    route: `${url.pathname}${url.search}`,
    fullUrl: url.href,
    method: request.method,
    errorName: error.name,
    message: error.message,
    stack: error.stack,
  });
}
