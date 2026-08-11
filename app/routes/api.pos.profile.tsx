import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getStaffProfileForPos } from "../services/staff-profile.server";
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
  const { employeeId, start, end, days } = body as {
    employeeId?: string;
    start?: string;
    end?: string;
    days?: number;
  };

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }

  try {
    const payload = await getStaffProfileForPos({
      shopDomain: sessionToken.dest,
      employeeId,
      start,
      end,
      days,
    });
    return cors(jsonResponse(payload));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Could not load staff profile",
        409,
      ),
    );
  }
};
