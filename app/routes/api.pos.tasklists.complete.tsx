import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { setPosTaskItemCompletion } from "../services/tasklists.server";
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
  const { employeeId, taskListId, taskItemId, completed } = body as {
    employeeId?: string;
    taskListId?: string;
    taskItemId?: string;
    completed?: boolean;
  };

  if (!employeeId || !taskListId || !taskItemId) {
    return cors(
      errorResponse("employeeId, taskListId, and taskItemId are required"),
    );
  }
  if (typeof completed !== "boolean") {
    return cors(errorResponse("completed must be true or false"));
  }

  try {
    const payload = await setPosTaskItemCompletion({
      shopDomain: sessionToken.dest,
      employeeId,
      taskListId,
      taskItemId,
      completed,
    });
    return cors(jsonResponse(payload));
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Could not update task",
        409,
      ),
    );
  }
};
