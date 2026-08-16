/**
 * Must match `application_url` in shopify.app.toml / shopify.app.local.toml.
 * POS relative fetch resolves against that URL; when the base is missing on device,
 * `fetch("/api/...")` throws "Failed to construct 'URL': Invalid URL".
 */
export const APP_BASE_URL = "https://staff.cloudcommerceus.com";

export function resolveAppUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = APP_BASE_URL.replace(/\/$/, "");
  return `${base}${normalized}`;
}
