export function mergeAppSearchParams(
  path: string,
  currentSearch: URLSearchParams,
): string {
  const [pathname, pathQuery = ""] = path.split("?");
  const merged = new URLSearchParams(pathQuery);

  for (const [key, value] of currentSearch.entries()) {
    if (!merged.has(key)) {
      merged.set(key, value);
    }
  }

  const query = merged.toString();
  return query ? `${pathname}?${query}` : pathname;
}
