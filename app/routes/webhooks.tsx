import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  handleAppUninstalled,
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
} from "../services/shop-lifecycle.server";

type CompliancePayload = {
  customer?: {
    id?: number;
    email?: string | null;
    phone?: string | null;
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  // authenticate.webhook normalizes topics to UPPER_SNAKE_CASE (e.g. APP_UNINSTALLED),
  // not the slash format from the x-shopify-topic header (e.g. app/uninstalled).
  switch (topic) {
    case "APP_UNINSTALLED":
      console.log(`Received ${topic} webhook for ${shop}`);
      await handleAppUninstalled(shop);
      break;

    case "APP_SCOPES_UPDATE": {
      console.log(`Received ${topic} webhook for ${shop}`);
      const current = (payload as { current?: string[] }).current ?? [];
      if (session) {
        await db.session.update({
          where: { id: session.id },
          data: { scope: current.join(",") },
        });
      }
      break;
    }

    case "CUSTOMERS_DATA_REQUEST": {
      console.log(`Received ${topic} webhook for ${shop}`);
      const compliance = payload as CompliancePayload;
      await handleCustomersDataRequest({
        shop,
        customer: compliance.customer,
      });
      break;
    }

    case "CUSTOMERS_REDACT": {
      console.log(`Received ${topic} webhook for ${shop}`);
      const compliance = payload as CompliancePayload;
      await handleCustomersRedact({
        shop,
        customer: compliance.customer,
      });
      break;
    }

    case "SHOP_REDACT":
      console.log(`Received ${topic} webhook for ${shop}`);
      await handleShopRedact(shop);
      break;

    default:
      console.warn(`Unhandled webhook topic: ${topic} for ${shop}`);
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
