import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Embedded admin should never land on the template marketing/login page.
 * Shopify opens application_url (/) after install, scope updates, and some nav
 * resets — always send those requests into the authenticated app shell.
 *
 * Non-embedded shop login remains available at /auth/login.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app${url.search}`);
};
