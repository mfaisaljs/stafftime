import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PricingPlans } from "../components/billing/PricingModal";
import {
  ensureUsageCycle,
  getShopBilling,
  syncSubscriptionFromPlanHandle,
} from "../services/billing.server";
import { formatUsd, FREE_PLAN_HANDLE } from "../services/billing/plans";
import {
  billingErrorMessage,
  billingReturnUrl,
  parseCheckoutPlanHandle,
  savePendingBillingCheckout,
} from "../services/billing/checkout";
import { ensureShop } from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureUsageCycle(session.shop);
  const billing = await getShopBilling(session.shop);

  return {
    planHandle: billing.planHandle,
    planName: billing.plan.name,
    includedStaff: billing.includedStaff,
    extraStaffCount: billing.extraStaffCount,
    extraStaffRate: billing.extraStaffRate,
    activeStaffCount: billing.activeStaffCount,
    atCap: billing.atCap,
    nextPlanName: billing.nextPlan?.name ?? null,
    nextPlanMax: billing.nextPlan?.maxStaff ?? null,
    pricingPlansUrl: billing.pricingPlansUrl,
    needsPlanSelection: billing.needsPlanSelection,
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

  await ensureShop(session.shop);

  const extraSeats = Math.max(0, Number(formData.get("extra_seats") ?? 0));

  if (planHandle === FREE_PLAN_HANDLE && extraSeats === 0) {
    await syncSubscriptionFromPlanHandle(session.shop, planHandle);
    await ensureUsageCycle(session.shop);
    return shopifyRedirect("/app/staff?billing=updated");
  }

  try {
    await savePendingBillingCheckout(session.shop, planHandle, extraSeats);
    await billing.request({
      plan: planHandle,
      isTest: process.env.SHOPIFY_BILLING_TEST !== "false",
      returnUrl: billingReturnUrl(request, session.shop),
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
    includedStaff,
    extraStaffCount,
    extraStaffRate,
    activeStaffCount,
    atCap,
    nextPlanName,
    nextPlanMax,
    pricingPlansUrl,
    needsPlanSelection,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const subscribeError = searchParams.get("subscribe_error");
  const welcome = searchParams.get("welcome") === "1" || needsPlanSelection;

  return (
    <s-page heading={welcome ? "Choose a plan" : "Pricing"} inlineSize="large">
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
        {welcome ? (
          <s-banner heading="Welcome to StaffTime" tone="info">
            <s-text>
              Pick the Free plan below or subscribe to a paid plan to get started.
            </s-text>
          </s-banner>
        ) : (
          <s-banner heading={`Current plan: ${planName}`} tone="info">
            <s-text>
              {activeStaffCount} staff · {includedStaff} included · {extraStaffCount}{" "}
              extra seat{extraStaffCount === 1 ? "" : "s"}
              {extraStaffCount > 0
                ? ` (${formatUsd(extraStaffCount * extraStaffRate)}/mo)`
                : ""}
              {atCap && nextPlanName
                ? ` Upgrade to ${nextPlanName} (up to ${nextPlanMax}) to add more.`
                : ""}
            </s-text>
          </s-banner>
        )}
        <PricingPlans
          pricingPlansUrl={pricingPlansUrl}
          currentPlanHandle={planHandle}
          initialStaffCount={Math.max(activeStaffCount, 1)}
          currentExtraStaffCount={extraStaffCount}
          atCap={atCap}
          needsPlanSelection={needsPlanSelection}
          variant="page"
        />
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
