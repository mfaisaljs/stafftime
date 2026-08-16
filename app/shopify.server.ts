import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { FREE_PLAN, extraSeatMax, PAID_PLANS, type Plan } from "./services/billing/plans";

function billingConfigForPlan(plan: Plan) {
  const lineItems: Array<
    | {
        amount: number;
        currencyCode: "USD";
        interval: typeof BillingInterval.Every30Days;
      }
    | {
        amount: number;
        currencyCode: "USD";
        interval: typeof BillingInterval.Usage;
        terms: string;
      }
  > = [
    {
      amount: plan.monthlyPrice,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
    },
  ];

  if (extraSeatMax(plan) > 0 && plan.extraStaffRate > 0) {
    lineItems.push({
      amount: plan.usageCappedAmount,
      currencyCode: "USD",
      interval: BillingInterval.Usage,
      terms: `$${plan.extraStaffRate} per extra staff beyond ${plan.includedStaff} included`,
    });
  }

  return {
    trialDays: plan.trialDays || undefined,
    lineItems,
  };
}

const billing = {
  [FREE_PLAN.handle]: billingConfigForPlan(FREE_PLAN),
  ...Object.fromEntries(
    PAID_PLANS.map((plan) => [plan.handle, billingConfigForPlan(plan)]),
  ),
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    APP_SCOPES_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      await shopify.registerWebhooks({ session });
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
