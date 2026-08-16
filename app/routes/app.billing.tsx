import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  refreshSubscription,
  saveShopifyShopGid,
  syncSubscriptionFromPlanHandle,
} from "../services/billing.server";

const SHOP_GID_QUERY = `#graphql
  query BillingShopGid {
    shop {
      id
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const planHandle = url.searchParams.get("plan_handle");

  try {
    const response = await admin.graphql(SHOP_GID_QUERY);
    const payload = (await response.json()) as {
      data?: { shop?: { id?: string } };
    };
    const shopGid = payload.data?.shop?.id;
    if (shopGid) {
      await saveShopifyShopGid(session.shop, shopGid);
    }
  } catch {
    // Shop GID is optional until App Events credentials are configured.
  }

  if (planHandle) {
    await syncSubscriptionFromPlanHandle(session.shop, planHandle);
    return redirect("/app/staff?billing=updated");
  }

  await refreshSubscription(session.shop);
  return redirect("/app/staff?billing=refreshed");
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
