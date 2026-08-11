import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createTimeOffRequestForPos,
  getTimeOffBootstrapForPos,
  listStaffTimeOffForPos,
  reviewTimeOffRequestForPos,
} from "../services/time-off-pos.server";
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
  const intent = String((body as { intent?: string }).intent ?? "load");
  const employeeId = String(
    (body as { employeeId?: string }).employeeId ?? "",
  ).trim();

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }

  try {
    switch (intent) {
      case "load": {
        const payload = await getTimeOffBootstrapForPos({
          shopDomain: sessionToken.dest,
          employeeId,
        });
        return cors(jsonResponse(payload));
      }
      case "create": {
        const { policyId, startDate, endDate, reason } = body as {
          policyId?: string;
          startDate?: string;
          endDate?: string;
          reason?: string;
        };
        const payload = await createTimeOffRequestForPos({
          shopDomain: sessionToken.dest,
          employeeId,
          policyId: String(policyId ?? ""),
          startDate: String(startDate ?? ""),
          endDate: String(endDate ?? ""),
          reason,
        });
        return cors(jsonResponse(payload));
      }
      case "staff": {
        const targetEmployeeId = String(
          (body as { targetEmployeeId?: string }).targetEmployeeId ?? "",
        ).trim();
        if (!targetEmployeeId) {
          return cors(errorResponse("targetEmployeeId is required"));
        }
        const payload = await listStaffTimeOffForPos({
          shopDomain: sessionToken.dest,
          employeeId,
          targetEmployeeId,
        });
        return cors(jsonResponse(payload));
      }
      case "review": {
        const requestId = String(
          (body as { requestId?: string }).requestId ?? "",
        ).trim();
        const status = String(
          (body as { status?: string }).status ?? "",
        ).toUpperCase();
        if (status !== "APPROVED" && status !== "DECLINED") {
          return cors(errorResponse("status must be APPROVED or DECLINED"));
        }
        const payload = await reviewTimeOffRequestForPos({
          shopDomain: sessionToken.dest,
          employeeId,
          requestId,
          status,
        });
        return cors(jsonResponse(payload));
      }
      default:
        return cors(errorResponse("Unknown intent"));
    }
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Time off request failed",
        409,
      ),
    );
  }
};
