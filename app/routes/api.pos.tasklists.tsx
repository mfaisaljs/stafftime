import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listEmployeeTaskListsForPos,
  type PosTaskListTab,
} from "../services/tasklists.server";
import {
  errorResponse,
  jsonResponse,
  posPreflightResponse,
} from "../utils/http.server";

const TABS = new Set<PosTaskListTab>(["all", "daily", "weekly", "monthly"]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return posPreflightResponse();
  return errorResponse("Method not allowed", 405);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const body = await request.json();
  const { employeeId, tab } = body as {
    employeeId?: string;
    tab?: string;
  };

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }
  if (!tab || !TABS.has(tab as PosTaskListTab)) {
    return cors(errorResponse("tab must be all, daily, weekly, or monthly"));
  }

  try {
    const payload = await listEmployeeTaskListsForPos({
      shopDomain: sessionToken.dest,
      employeeId,
      tab: tab as PosTaskListTab,
    });
    return cors(jsonResponse(payload));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Could not load task lists",
        409,
      ),
    );
  }
};
