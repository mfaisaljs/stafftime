/** Shopify embedded-admin params that must survive client-side navigation. */
const PRESERVED_SEARCH_PARAMS = new Set([
  "admin_theme",
  "embedded",
  "hmac",
  "host",
  "id_token",
  "locale",
  "session",
  "shop",
  "timestamp",
]);

export function mergeAppSearchParams(
  path: string,
  currentSearch: URLSearchParams,
): string {
  const [pathname, pathQuery = ""] = path.split("?");
  const merged = new URLSearchParams(pathQuery);

  for (const key of PRESERVED_SEARCH_PARAMS) {
    const value = currentSearch.get(key);
    if (value && !merged.has(key)) {
      merged.set(key, value);
    }
  }

  const query = merged.toString();
  return query ? `${pathname}?${query}` : pathname;
}
