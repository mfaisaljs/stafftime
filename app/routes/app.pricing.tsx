import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PricingPlans } from "../components/billing/PricingModal";
import { ensureUsageCycle, getShopBilling } from "../services/billing.server";

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

  return (
    <s-page heading="Pricing" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-banner heading={`Current plan: ${planName}`} tone="info">
          <s-text>
            {activeStaffCount} staff ({includedStaff} included
            {extraStaffCount > 0
              ? ` + ${extraStaffCount} extra at $${extraStaffRate}/mo`
              : ""}
            ) of {staffLimit} max.
            {atCap && nextPlanName
              ? ` Upgrade to ${nextPlanName} (up to ${nextPlanMax}) to add more.`
              : ""}
          </s-text>
        </s-banner>
        <PricingPlans
          pricingPlansUrl={pricingPlansUrl}
          currentPlanHandle={planHandle}
          initialStaffCount={Math.max(activeStaffCount, 2)}
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
