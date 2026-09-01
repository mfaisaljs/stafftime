export const CLIENT_SHOP_DOMAIN_STORAGE_KEY = "trubuild:shop-domain";

export function persistClientShopDomain(shopDomain: string | undefined): void {
  if (typeof window === "undefined" || !shopDomain) return;
  try {
    window.sessionStorage.setItem(CLIENT_SHOP_DOMAIN_STORAGE_KEY, shopDomain);
  } catch {
    // ignore quota / private mode
  }
}

export function shopFromHostParam(host: string | null): string | undefined {
  if (!host) return undefined;
  try {
    const normalized = host.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized.length % 4 === 0
        ? normalized
        : `${normalized}${"=".repeat(4 - (normalized.length % 4))}`;
    const decoded = atob(padded);
    const storeMatch = decoded.match(/\/store\/([a-zA-Z0-9-]+)/);
    if (storeMatch?.[1]) return `${storeMatch[1]}.myshopify.com`;
    const domainMatch = decoded.match(/([a-zA-Z0-9-]+\.myshopify\.com)/);
    return domainMatch?.[1];
  } catch {
    return undefined;
  }
}
