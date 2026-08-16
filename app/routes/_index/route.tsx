import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { isPortalHost } from "../../utils/portal-url.server";

/**
 * Embedded admin should never land on the template marketing/login page.
 * Shopify opens application_url (/) after install, scope updates, and some nav
 * resets — always send those requests into the authenticated app shell.
 *
 * A dedicated portal subdomain (PORTAL_URL / PORTAL_HOST) serves /portal instead.
 * Non-embedded shop login remains available at /auth/login.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (isPortalHost(request) || url.searchParams.has("ShopDomain")) {
    throw redirect(`/portal${url.search}`);
  }
  throw redirect(`/app${url.search}`);
};
