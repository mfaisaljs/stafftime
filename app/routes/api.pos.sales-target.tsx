import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getEmployeeSalesTargetForPos } from "../services/sales-targets.server";
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
  const body = await request.json();
  const employeeId = String(
    (body as { employeeId?: string }).employeeId ?? "",
  ).trim();

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }

  try {
    const payload = await getEmployeeSalesTargetForPos({
      shopDomain: sessionToken.dest,
      employeeId,
    });
    return cors(jsonResponse(payload));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error
          ? error.message
          : "Could not load sales target",
        409,
      ),
    );
  }
};
