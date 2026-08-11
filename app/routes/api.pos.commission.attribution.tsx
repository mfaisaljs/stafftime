import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  attributeOrderToCommission,
  getCommissionOrderAttribution,
} from "../services/commission.server";
import {
  errorResponse,
  jsonResponse,
  posPreflightResponse,
} from "../utils/http.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return posPreflightResponse();
  return errorResponse("Method not allowed", 405);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const body = (await request.json()) as {
    intent?: string;
    orderId?: string | number;
    employeeId?: string;
  };

  const intent = String(body.intent || "status").trim();
  const orderId = body.orderId;
  if (orderId === undefined || orderId === null || String(orderId).trim() === "") {
    return cors(errorResponse("orderId is required"));
  }

  try {
    if (intent === "status" || intent === "preview") {
      const payload = await getCommissionOrderAttribution({
        shopDomain: sessionToken.dest,
        orderId,
        employeeId: body.employeeId
          ? String(body.employeeId).trim()
          : undefined,
      });
      return cors(jsonResponse(payload));
    }

    if (intent === "attribute") {
      const employeeId = String(body.employeeId || "").trim();
      if (!employeeId) {
        return cors(errorResponse("employeeId is required"));
      }

      const payload = await attributeOrderToCommission({
        shopDomain: sessionToken.dest,
        employeeId,
        orderId,
      });
      return cors(jsonResponse(payload));
    }

    return cors(errorResponse("Unknown intent"));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error
          ? error.message
          : "Could not process commission attribution",
        409,
      ),
    );
  }
};
