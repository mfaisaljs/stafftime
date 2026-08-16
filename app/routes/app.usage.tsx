import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { AppPage } from "../components/AppPage";
import { getShopBilling } from "../services/billing.server";
import { formatUsd } from "../services/billing/plans";

const USAGE_BILLING_QUERY = `#graphql
  query UsageBilling {
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

function formatMoney(money?: Money | null) {
  if (!money) return "—";
  const amount = Number(money.amount);
  if (Number.isNaN(amount)) return `${money.amount} ${money.currencyCode}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currencyCode || "USD",
  }).format(amount);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function intervalLabel(interval?: string) {
  if (interval === "ANNUAL") return "Yearly";
  if (interval === "EVERY_30_DAYS") return "Monthly";
  return interval ?? "Monthly";
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING" || status === "FROZEN") return "warning";
  if (status === "CANCELLED" || status === "DECLINED" || status === "EXPIRED") {
    return "critical";
  }
  return "info";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const local = await getShopBilling(session.shop);

  const response = await admin.graphql(USAGE_BILLING_QUERY);
  const payload = (await response.json()) as {
    data?: {
      currentAppInstallation?: {
        activeSubscriptions?: ShopifySubscription[];
      };
    };
    errors?: Array<{ message?: string }>;
  };

  const subscriptions =
    payload.data?.currentAppInstallation?.activeSubscriptions ?? [];
  const subscription = subscriptions[0] ?? null;
  const recurring = subscription?.lineItems.find(
    (item) => item.plan?.pricingDetails?.__typename === "AppRecurringPricing",
  );
  const usage = subscription?.lineItems.find(
    (item) => item.plan?.pricingDetails?.__typename === "AppUsagePricing",
  );
  const usageDetails = usage?.plan?.pricingDetails;
  const recurringDetails = recurring?.plan?.pricingDetails;
  const usageRecords = usage?.usageRecords?.nodes ?? [];
  const usageUsed = Number(usageDetails?.balanceUsed?.amount ?? 0);
  const usageCap = Number(usageDetails?.cappedAmount?.amount ?? 0);
  const usageRecordTotal = usageRecords.reduce(
    (sum, record) => sum + Number(record.price?.amount ?? 0),
    0,
  );
  const activeExtraStaff = Math.max(
    0,
    local.activeStaffCount - local.includedStaff,
  );

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
      activeStaffCount: local.activeStaffCount,
      activeExtraStaff,
    },
    subscription,
    recurringCharge: recurringDetails?.price ?? null,
    recurringInterval: intervalLabel(recurringDetails?.interval),
    usageCapAmount: usageDetails?.cappedAmount ?? null,
    usageFee: usageDetails?.balanceUsed ?? null,
    usageRemaining:
      usageCap > 0 ? Math.max(0, usageCap - usageUsed) : null,
    usageTerms: usageDetails?.terms ?? null,
    usageRecordTotal,
    usageRecords,
    errors: payload.errors?.map((error) => error.message).filter(Boolean) ?? [],
  };
};

export default function UsagePage() {
  const {
    shop,
    local,
    subscription,
    recurringCharge,
    recurringInterval,
    usageCapAmount,
    usageFee,
    usageRemaining,
    usageTerms,
    usageRecordTotal,
    usageRecords,
    errors,
  } = useLoaderData<typeof loader>();

  return (
    <AppPage heading="Usage" inlineSize="large">
      <s-button slot="primary-action" variant="primary" href="/app/pricing">
        Change plan
      </s-button>

      <s-stack direction="block" gap="large">
        {errors.length ? (
          <s-banner heading="Could not load Shopify billing" tone="critical">
            <s-text>{errors.join(" ")}</s-text>
          </s-banner>
        ) : null}

        {!subscription ? (
          <s-banner heading="No Shopify usage subscription" tone="warning">
            <s-stack direction="block" gap="small">
              <s-text>
                {shop} has no approved Shopify app subscription, so Usage cannot
                show cap, usage fee, or charges
                {local.extraSeats > 0
                  ? ` (${local.extraSeats} extra seat${
                      local.extraSeats === 1 ? "" : "s"
                    } are saved locally only).`
                  : "."}{" "}
                Subscribe again on Pricing to approve usage billing.
              </s-text>
              <s-button href="/app/pricing" variant="primary">
                Approve usage billing
              </s-button>
            </s-stack>
          </s-banner>
        ) : null}

        <s-query-container>
          <s-section heading="Current charges" padding="base">
            <s-grid
              gridTemplateColumns="@container (inline-size <= 560px) 1fr 1fr, 1fr 1fr 1fr 1fr"
              gap="base"
            >
              <s-box padding="small">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Recurring charge</s-text>
                  <s-heading>{formatMoney(recurringCharge)}</s-heading>
                  <s-text color="subdued">{recurringInterval}</s-text>
                </s-stack>
              </s-box>
              <s-box padding="small">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Usage fee</s-text>
                  <s-heading>
                    {subscription
                      ? formatUsd(usageRecordTotal || usageUsed)
                      : formatUsd(local.extraCharge)}
                  </s-heading>
                  <s-text color="subdued">Subscribed extras this period</s-text>
                </s-stack>
              </s-box>
              <s-box padding="small">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Usage cap</s-text>
                  <s-heading>
                    {subscription
                      ? formatMoney(usageCapAmount)
                      : formatUsd(local.usageCap)}
                  </s-heading>
                  <s-text color="subdued">
                    {subscription
                      ? usageRemaining == null
                        ? "No Shopify cap on file"
                        : `${formatUsd(usageRemaining)} remaining`
                      : "Configured plan cap"}
                  </s-text>
                </s-stack>
              </s-box>
              <s-box padding="small">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Subscribed extra seats</s-text>
                  <s-heading>{String(local.extraSeats)}</s-heading>
                  <s-text color="subdued">
                    {formatUsd(local.extraStaffRate)} each · {local.activeExtraStaff}{" "}
                    in use
                  </s-text>
                </s-stack>
              </s-box>
            </s-grid>
          </s-section>
        </s-query-container>

        <s-section heading="Subscription">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-heading>{subscription?.name ?? local.planName}</s-heading>
              {subscription ? (
                <s-badge tone={statusTone(subscription.status)}>
                  {subscription.status.toLowerCase()}
                </s-badge>
              ) : (
                <s-badge tone="info">{local.subscriptionStatus}</s-badge>
              )}
              {subscription?.test ? <s-badge tone="warning">Test</s-badge> : null}
            </s-stack>
            <s-paragraph tone="neutral" color="subdued">
              {shop} · {local.planName} includes {local.includedStaff} seats.
              Extra seats are billed as usage at {formatUsd(local.extraStaffRate)}{" "}
              each, up to a {formatUsd(local.usageCap)} cap.
            </s-paragraph>
            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
              <s-box
                padding="base"
                background="subdued"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Started</s-text>
                  <s-text type="strong">{formatDate(subscription?.createdAt)}</s-text>
                </s-stack>
              </s-box>
              <s-box
                padding="base"
                background="subdued"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Period ends</s-text>
                  <s-text type="strong">
                    {formatDate(subscription?.currentPeriodEnd)}
                  </s-text>
                </s-stack>
              </s-box>
              <s-box
                padding="base"
                background="subdued"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Trial days</s-text>
                  <s-text type="strong">{subscription?.trialDays ?? 0}</s-text>
                </s-stack>
              </s-box>
            </s-grid>
            {usageTerms ? (
              <s-text color="subdued">Usage terms: {usageTerms}</s-text>
            ) : null}
          </s-stack>
        </s-section>

        <s-section heading="Usage charges">
          {usageRecords.length === 0 ? (
            <s-paragraph tone="neutral" color="subdued">
              No extra-seat usage has been charged this period.
            </s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Date</s-table-header>
                <s-table-header listSlot="secondary">Description</s-table-header>
                <s-table-header listSlot="labeled" format="currency">
                  Charge
                </s-table-header>
              </s-table-header-row>
              <s-table-body>
                {usageRecords.map((record) => (
                  <s-table-row key={record.id}>
                    <s-table-cell>{formatDate(record.createdAt)}</s-table-cell>
                    <s-table-cell>{record.description}</s-table-cell>
                    <s-table-cell>{formatMoney(record.price)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      </s-stack>
    </AppPage>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
