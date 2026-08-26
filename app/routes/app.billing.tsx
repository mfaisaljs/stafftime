import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  refreshSubscription,
  saveShopifyShopGid,
  syncSubscriptionFromPlanHandle,
} from "../services/billing.server";
import {
  isShopifyBillingTest,
  takePendingBillingCheckout,
  restoreEmbeddedBillingParams,
} from "../services/billing/checkout";
import { getPlan } from "../services/billing/plans";
import { emailService } from "../services/email.server";
import { getShopInfo } from "../services/shop-info.server";
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
  await restoreEmbeddedBillingParams(request);
  const { admin, billing, session, redirect: shopifyRedirect } =
    await authenticate.admin(request);
  const url = new URL(request.url);
  let planHandle = url.searchParams.get("plan_handle");
  let extraSeats = Math.max(0, Number(url.searchParams.get("extra_seats") ?? 0));
  let pendingCheckout = null;

  if (!planHandle) {
    pendingCheckout = await takePendingBillingCheckout(session.shop);
    if (pendingCheckout) {
      planHandle = pendingCheckout.planHandle;
      extraSeats = pendingCheckout.extraSeats;
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
    const plan = getPlan(planHandle);
    await syncSubscriptionFromPlanHandle(session.shop, planHandle);
    if (pendingCheckout || extraSeats > 0) {
      await prisma.shop.update({
        where: { domain: shopFromDest(session.shop).toLowerCase() },
        data: { reportedStaffUsage: extraSeats },
      });
      if (extraSeats > 0) {
        try {
          await billing.createUsageRecord({
            description: `${extraSeats} extra staff seat${extraSeats === 1 ? "" : "s"}`,
            price: {
              amount: extraSeats * plan.extraStaffRate,
              currencyCode: "USD",
            },
            isTest: isShopifyBillingTest(session.shop),
          });
        } catch (error) {
          if (error instanceof Response) {
            throw error;
          }
        }
      }
    }

    try {
      const shopInfo = await getShopInfo(admin);
      await emailService.sendAppChargeAcceptedNotification(
        shopFromDest(session.shop).toLowerCase(),
        shopInfo?.name,
        plan.name,
        plan.monthlyPrice,
      );
    } catch (emailError) {
      console.error(
        "Failed to send charge accepted email notification:",
        emailError,
      );
    }

    return shopifyRedirect("/app/staff?billing=updated");
  }

  await refreshSubscription(session.shop);
  return shopifyRedirect("/app/staff?billing=refreshed");
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
