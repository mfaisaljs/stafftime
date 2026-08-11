import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listEmployeeShiftsForPos,
  type PosShiftRange,
} from "../services/workforce.server";
import {
  errorResponse,
  jsonResponse,
  posPreflightResponse,
} from "../utils/http.server";

const RANGES = new Set<PosShiftRange>([
  "upcoming",
  "today",
  "week",
  "month",
]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return posPreflightResponse();
  return errorResponse("Method not allowed", 405);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const body = await request.json();
  const { employeeId, range } = body as {
    employeeId?: string;
    range?: string;
  };

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }
  if (!range || !RANGES.has(range as PosShiftRange)) {
    return cors(errorResponse("range must be upcoming, today, week, or month"));
  }

  try {
    const payload = await listEmployeeShiftsForPos({
      shopDomain: sessionToken.dest,
      employeeId,
      range: range as PosShiftRange,
    });
    return cors(jsonResponse(payload));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Could not load shifts",
        409,
      ),
    );
  }
};
