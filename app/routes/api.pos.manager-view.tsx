import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  bootstrapManagerViewForPos,
  getManagerViewStaffDetailForPos,
  managerClockActionForPos,
} from "../services/manager-view.server";
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
  const intent = String((body as { intent?: string }).intent ?? "bootstrap");
  const managerId = String(
    (body as { managerId?: string }).managerId ?? "",
  ).trim();

  if (!managerId) {
    return cors(errorResponse("managerId is required"));
  }

  try {
    switch (intent) {
      case "bootstrap": {
        const payload = await bootstrapManagerViewForPos({
          shopDomain: sessionToken.dest,
          managerId,
        });
        return cors(jsonResponse(payload));
      }
      case "detail": {
        const staffId = String(
          (body as { staffId?: string }).staffId ?? "",
        ).trim();
        if (!staffId) {
          return cors(errorResponse("staffId is required"));
        }
        const { start, end, days } = body as {
          start?: string;
          end?: string;
          days?: number;
        };
        const payload = await getManagerViewStaffDetailForPos({
          shopDomain: sessionToken.dest,
          managerId,
          staffId,
          start,
          end,
          days,
        });
        return cors(jsonResponse(payload));
      }
      case "clock": {
        const staffId = String(
          (body as { staffId?: string }).staffId ?? "",
        ).trim();
        const action = String(
          (body as { action?: string }).action ?? "",
        ).trim() as "clock-in" | "clock-out" | "break-start" | "break-end";
        const notes = (body as { notes?: string }).notes;
        if (!staffId) {
          return cors(errorResponse("staffId is required"));
        }
        if (
          action !== "clock-in" &&
          action !== "clock-out" &&
          action !== "break-start" &&
          action !== "break-end"
        ) {
          return cors(errorResponse("Invalid clock action"));
        }
        const payload = await managerClockActionForPos({
          shopDomain: sessionToken.dest,
          managerId,
          staffId,
          action,
          notes,
        });
        return cors(jsonResponse(payload));
      }
      default:
        return cors(errorResponse("Unknown intent"));
    }
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Manager View request failed",
        409,
      ),
    );
  }
};
