import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getEmployeeProfileForPos } from "../services/profile.server";
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
  const { employeeId } = body as { employeeId?: string };

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }

  try {
    const payload = await getEmployeeProfileForPos({
      shopDomain: sessionToken.dest,
      employeeId,
    });
    return cors(jsonResponse(payload));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Could not load profile",
        409,
      ),
    );
  }
};
