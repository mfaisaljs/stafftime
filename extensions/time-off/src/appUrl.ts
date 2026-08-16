/**
 * Must match `application_url` in shopify.app.toml / shopify.app.local.toml.
 */
export const APP_BASE_URL = "https://staff-time.onrender.com";

export function resolveAppUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = APP_BASE_URL.replace(/\/$/, "");
  return `${base}${normalized}`;
}
