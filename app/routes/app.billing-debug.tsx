import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppPage } from "../components/AppPage";
import { getShopBilling } from "../services/billing.server";
import { formatUsd } from "../services/billing/plans";

const BILLING_DEBUG_QUERY = `#graphql
  query BillingDebug {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        createdAt
        currentPeriodEnd
        trialDays
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price {
                  amount
                  currencyCode
                }
              }
              ... on AppUsagePricing {
                terms
                interval
                cappedAmount {
                  amount
                  currencyCode
                }
                balanceUsed {
                  amount
                  currencyCode
                }
              }
            }
          }
          usageRecords(first: 50, reverse: true) {
            nodes {
              id
              description
              createdAt
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

type Money = { amount: string; currencyCode: string };

type PricingDetails = {
  __typename?: string;
  interval?: string;
  terms?: string;
  price?: Money;
  cappedAmount?: Money;
  balanceUsed?: Money;
};

type UsageRecord = {
  id: string;
  description: string;
  createdAt: string;
  price: Money;
};

type LineItem = {
  id: string;
  plan?: { pricingDetails?: PricingDetails };
  usageRecords?: { nodes?: UsageRecord[] };
};

type ShopifySubscription = {
  id: string;
  name: string;
  status: string;
  test: boolean;
  createdAt: string;
  currentPeriodEnd?: string | null;
  trialDays: number;
  lineItems: LineItem[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const local = await getShopBilling(session.shop);

  const response = await admin.graphql(BILLING_DEBUG_QUERY);
  const payload = (await response.json()) as {
    data?: {
      currentAppInstallation?: {
        activeSubscriptions?: ShopifySubscription[];
      };
    };
    errors?: Array<{ message?: string }>;
  };

  return {
    shop: session.shop,
    local: {
      planHandle: local.planHandle,
      planName: local.plan.name,
      subscriptionStatus: local.subscriptionStatus,
      includedStaff: local.includedStaff,
      extraStaffRate: local.extraStaffRate,
      extraSeats: local.reportedStaffUsage,
      extraCharge: local.reportedStaffUsage * local.extraStaffRate,
      usageCap: local.plan.usageCappedAmount,
    },
    subscriptions: payload.data?.currentAppInstallation?.activeSubscriptions ?? [],
    errors: payload.errors?.map((error) => error.message).filter(Boolean) ?? [],
  };
};

export default function BillingDebugPage() {
  const { shop, local, subscriptions, errors } = useLoaderData<typeof loader>();

  return (
    <AppPage heading="Billing test" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-banner heading="Test route" tone="warning">
          <s-text>
            Live Shopify billing for {shop}. Local extras are what StaffTime
            stored; Shopify lines are the actual charge.
          </s-text>
        </s-banner>

        {errors.length ? (
          <s-banner heading="Shopify billing query error" tone="critical">
            <s-text>{errors.join(" ")}</s-text>
          </s-banner>
        ) : null}

        <s-section heading="Local StaffTime billing">
          <s-stack direction="block" gap="small">
            <s-text>
              Plan: {local.planName} ({local.planHandle}) · status{" "}
              {local.subscriptionStatus}
            </s-text>
            <s-text>
              Included seats: {local.includedStaff} · Extra quantity:{" "}
              {local.extraSeats} · Extra rate: {formatUsd(local.extraStaffRate)}
            </s-text>
            <s-text>
              Extra charge (quantity × rate): {formatUsd(local.extraCharge)} ·
              Configured usage cap: {formatUsd(local.usageCap)}
            </s-text>
          </s-stack>
        </s-section>

        {subscriptions.length === 0 ? (
          <s-banner heading="No active Shopify subscription" tone="info">
            <s-text>Shopify has no active app subscription for this shop.</s-text>
          </s-banner>
        ) : (
          subscriptions.map((subscription) => (
            <s-section key={subscription.id} heading={`${subscription.name} · ${subscription.status}`}>
              <s-stack direction="block" gap="base">
                <s-text>
                  ID: {subscription.id}
                  {subscription.test ? " · TEST charge" : ""}
                </s-text>
                <s-text>
                  Created: {subscription.createdAt}
                  {subscription.currentPeriodEnd
                    ? ` · Period ends: ${subscription.currentPeriodEnd}`
                    : ""}
                  {subscription.trialDays
                    ? ` · Trial days: ${subscription.trialDays}`
                    : ""}
                </s-text>

                {subscription.lineItems.map((item) => {
                  const details = item.plan?.pricingDetails;
                  const isUsage = details?.__typename === "AppUsagePricing";
                  const records = item.usageRecords?.nodes ?? [];
                  const periodUsed = Number(details?.balanceUsed?.amount ?? 0);
                  const impliedQuantity =
                    isUsage && local.extraStaffRate > 0
                      ? periodUsed / local.extraStaffRate
                      : null;

                  return (
                    <s-box
                      key={item.id}
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <s-stack direction="block" gap="small">
                        <s-text>
                          {isUsage ? "Usage line" : "Recurring charge"} · {item.id}
                        </s-text>
                        {details?.price ? (
                          <s-text>
                            Charge: {details.price.amount} {details.price.currencyCode} /{" "}
                            {details.interval ?? "period"}
                          </s-text>
                        ) : null}
                        {details?.cappedAmount ? (
                          <s-text>
                            Cap amount: {details.cappedAmount.amount}{" "}
                            {details.cappedAmount.currencyCode}
                          </s-text>
                        ) : null}
                        {details?.balanceUsed ? (
                          <s-text>
                            Usage fee used this period: {details.balanceUsed.amount}{" "}
                            {details.balanceUsed.currencyCode}
                          </s-text>
                        ) : null}
                        {details?.terms ? <s-text>Terms: {details.terms}</s-text> : null}
                        {isUsage ? (
                          <s-text>
                            Quantity (period used ÷ extra rate):{" "}
                            {impliedQuantity ?? "n/a"} · Usage records listed:{" "}
                            {records.length}
                          </s-text>
                        ) : null}
                        {records.map((record) => (
                          <s-text key={record.id}>
                            {record.createdAt}: {record.description} ·{" "}
                            {record.price.amount} {record.price.currencyCode}
                          </s-text>
                        ))}
                      </s-stack>
                    </s-box>
                  );
                })}
              </s-stack>
            </s-section>
          ))
        )}
      </s-stack>
    </AppPage>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
