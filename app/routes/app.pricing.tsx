import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PricingPlans } from "../components/billing/PricingModal";
import { ensureUsageCycle, getShopBilling } from "../services/billing.server";
import { formatUsd } from "../services/billing/plans";
import {
  billingErrorMessage,
  billingReturnUrl,
  parseCheckoutPlanHandle,
} from "../services/billing/checkout";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureUsageCycle(session.shop);
  const billing = await getShopBilling(session.shop);

  return {
    planHandle: billing.planHandle,
    planName: billing.plan.name,
    staffLimit: billing.staffLimit,
    includedStaff: billing.includedStaff,
    extraStaffCount: billing.extraStaffCount,
    extraStaffRate: billing.extraStaffRate,
    activeStaffCount: billing.activeStaffCount,
    atCap: billing.atCap,
    nextPlanName: billing.nextPlan?.name ?? null,
    nextPlanMax: billing.nextPlan?.maxStaff ?? null,
    pricingPlansUrl: billing.pricingPlansUrl,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, redirect: shopifyRedirect, session } =
    await authenticate.admin(request);
  const formData = await request.formData();
  const planHandle = parseCheckoutPlanHandle(formData.get("plan"));

  if (!planHandle) {
    return shopifyRedirect("/app/pricing?subscribe_error=pick_plan");
  }

  try {
    await billing.request({
      plan: planHandle,
      isTest: process.env.SHOPIFY_BILLING_TEST !== "false",
      returnUrl: billingReturnUrl(request, planHandle, session.shop),
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    const message = encodeURIComponent(billingErrorMessage(error));
    return shopifyRedirect(`/app/pricing?subscribe_error=${message}`);
  }
};

export default function PricingPage() {
  const {
    planHandle,
    planName,
    staffLimit,
    includedStaff,
    extraStaffCount,
    extraStaffRate,
    activeStaffCount,
    atCap,
    nextPlanName,
    nextPlanMax,
    pricingPlansUrl,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const subscribeError = searchParams.get("subscribe_error");

  return (
    <s-page heading="Pricing" inlineSize="large">
      <s-stack direction="block" gap="large">
        {subscribeError ? (
          <s-banner heading="Could not start checkout" tone="critical">
            <s-text>
              {subscribeError === "pick_plan"
                ? "Choose a plan to subscribe."
                : subscribeError}
            </s-text>
          </s-banner>
        ) : null}
        <s-banner heading={`Current plan: ${planName}`} tone="info">
          <s-text>
            {activeStaffCount} staff · {includedStaff} included · {extraStaffCount}{" "}
            extra seat{extraStaffCount === 1 ? "" : "s"}
            {extraStaffCount > 0
              ? ` (${formatUsd(extraStaffCount * extraStaffRate)}/mo)`
              : ""}{" "}
            · {staffLimit} max.
            {atCap && nextPlanName
              ? ` Upgrade to ${nextPlanName} (up to ${nextPlanMax}) to add more.`
              : ""}
          </s-text>
        </s-banner>
        <PricingPlans
          pricingPlansUrl={pricingPlansUrl}
          currentPlanHandle={planHandle}
          initialStaffCount={Math.max(activeStaffCount, 2)}
          currentExtraStaffCount={extraStaffCount}
          atCap={atCap}
          variant="page"
        />
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
