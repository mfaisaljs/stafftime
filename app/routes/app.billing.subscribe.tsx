import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAppHandle, shopifyPricingPlansUrl } from "../services/billing/plans";

async function redirectToPricingPlans(request: Request) {
  const { session } = await authenticate.admin(request);
  return redirect(
    shopifyPricingPlansUrl({
      shopDomain: session.shop,
      appHandle: getAppHandle(),
    }),
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirectToPricingPlans(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return redirectToPricingPlans(request);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
