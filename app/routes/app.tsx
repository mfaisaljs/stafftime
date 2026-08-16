import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { Outlet, redirect, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { getShopBilling } from "../services/billing.server";
import { ensureShop } from "../services/workforce.server";
import ChatraWidget from "../components/ChatraWidget";
import { shopFromDest } from "../utils/http.server";
import { mergeAppSearchParams } from "../utils/app-path";

const SHOP_NAME_QUERY = `#graphql
  query ChatraShopName {
    shop {
      name
      myshopifyDomain
    }
  }
`;

function AppNavLink({ href, children }: { href: string; children: ReactNode }) {
  const { search } = useLocation();
  return (
    <s-link href={mergeAppSearchParams(href, new URLSearchParams(search))}>
      {children}
    </s-link>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  if (
    !url.pathname.startsWith("/app/pricing") &&
    !url.pathname.startsWith("/app/billing") &&
    !url.pathname.startsWith("/app/usage")
  ) {
    await ensureShop(session.shop);
    const billing = await getShopBilling(session.shop);
    if (billing.needsPlanSelection) {
      const params = new URLSearchParams(url.searchParams);
      params.set("welcome", "1");
      throw redirect(`/app/pricing?${params.toString()}`);
    }
  }

  const shopDomain = shopFromDest(session.shop).toLowerCase();
  let shopName = shopDomain.replace(/\.myshopify\.com$/i, "");
  try {
    const shopResponse = await admin.graphql(SHOP_NAME_QUERY);
    const shopPayload = (await shopResponse.json()) as {
      data?: { shop?: { name?: string; myshopifyDomain?: string } };
    };
    const liveName = shopPayload.data?.shop?.name?.trim();
    if (liveName) {
      shopName = liveName;
    }
    const liveDomain = shopPayload.data?.shop?.myshopifyDomain?.trim();
    if (liveDomain) {
      return {
        apiKey: process.env.SHOPIFY_API_KEY || "",
        shopDomain: liveDomain.toLowerCase(),
        shopName,
      };
    }
  } catch {
    // Chatra still gets the session shop handle if Admin GraphQL is unavailable.
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shopDomain,
    shopName,
  };
};

export default function App() {
  const { apiKey, shopDomain, shopName } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ChatraWidget shopDomain={shopDomain} shopName={shopName} />
      <s-app-nav>
        <AppNavLink href="/app">Dashboard</AppNavLink>
        <AppNavLink href="/app/staff">Staff</AppNavLink>
        <AppNavLink href="/app/reports">Reports</AppNavLink>
        <AppNavLink href="/app/schedules">Schedule</AppNavLink>
        <AppNavLink href="/app/commission-programs">Commission Program</AppNavLink>
        <AppNavLink href="/app/sales-targets">Sales Target</AppNavLink>
        <AppNavLink href="/app/payroll">Payroll</AppNavLink>
        <AppNavLink href="/app/tasklists">Tasklist</AppNavLink>
        <AppNavLink href="/app/time-off">Time Off</AppNavLink>
        <AppNavLink href="/app/pricing">Pricing</AppNavLink>
        <AppNavLink href="/app/usage">Usage</AppNavLink>
        <AppNavLink href="/app/settings">Settings</AppNavLink>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
