import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PricingPlans } from "../components/billing/PricingModal";
import { getShopBilling } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const billing = await getShopBilling(session.shop);

  return {
    planHandle: billing.planHandle,
    planName: billing.plan.name,
    staffLimit: billing.staffLimit,
    activeStaffCount: billing.activeStaffCount,
    pricingPlansUrl: billing.pricingPlansUrl,
  };
};

export default function PricingPage() {
  const {
    planHandle,
    planName,
    staffLimit,
    activeStaffCount,
    pricingPlansUrl,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Pricing" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-banner heading={`Current plan: ${planName}`} tone="info">
          <s-text>
            {activeStaffCount} of {staffLimit} staff seats in use.
          </s-text>
        </s-banner>
        <PricingPlans
          pricingPlansUrl={pricingPlansUrl}
          currentPlanHandle={planHandle}
          initialStaffCount={Math.max(activeStaffCount, 2)}
          variant="page"
        />
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
