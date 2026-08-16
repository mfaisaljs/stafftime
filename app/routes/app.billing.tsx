import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  ensureUsageCycle,
  refreshSubscription,
  saveShopifyShopGid,
  syncSubscriptionFromPlanHandle,
} from "../services/billing.server";
import { takePendingBillingCheckout } from "../services/billing/checkout";
import prisma from "../db.server";
import { shopFromDest } from "../utils/http.server";

const SHOP_GID_QUERY = `#graphql
  query BillingShopGid {
    shop {
      id
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect: shopifyRedirect } =
    await authenticate.admin(request);
  const url = new URL(request.url);
  let planHandle = url.searchParams.get("plan_handle");
  let extraSeats = Math.max(0, Number(url.searchParams.get("extra_seats") ?? 0));

  if (!planHandle) {
    const pending = await takePendingBillingCheckout(session.shop);
    if (pending) {
      planHandle = pending.planHandle;
      extraSeats = pending.extraSeats;
    }
  }

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
    if (extraSeats > 0) {
      await prisma.shop.update({
        where: { domain: shopFromDest(session.shop).toLowerCase() },
        data: { reportedStaffUsage: extraSeats },
      });
    }
    await ensureUsageCycle(session.shop);
    return shopifyRedirect("/app/staff?billing=updated");
  }

  await refreshSubscription(session.shop);
  await ensureUsageCycle(session.shop);
  return shopifyRedirect("/app/staff?billing=refreshed");
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
