import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clockIn,
  clockOut,
  endBreak,
  startBreak,
} from "../services/workforce.server";
import { errorResponse, jsonResponse, posPreflightResponse } from "./http.server";

type PosAction = "clock-in" | "clock-out" | "break-start" | "break-end";

export async function handlePosPreflight({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return posPreflightResponse();
  return errorResponse("Method not allowed", 405);
}

export async function handlePosClockAction(request: Request, action: PosAction) {
  const { sessionToken, cors } = await authenticate.pos(request);
  const body = await request.json();
  const { employeeId, notes } = body as {
    employeeId?: string;
    notes?: string;
  };

  if (!employeeId) {
    return cors(errorResponse("employeeId is required"));
  }

  try {
    let status;
    switch (action) {
      case "clock-in":
        status = await clockIn({ shopDomain: sessionToken.dest, employeeId });
        break;
      case "clock-out":
        status = await clockOut({
          shopDomain: sessionToken.dest,
          employeeId,
          notes,
        });
        break;
      case "break-start":
        status = await startBreak({ shopDomain: sessionToken.dest, employeeId });
        break;
      case "break-end":
        status = await endBreak({ shopDomain: sessionToken.dest, employeeId });
        break;
    }
    return cors(jsonResponse({ status, serverTime: Date.now() }));
  } catch (error) {
    return cors(
      errorResponse(error instanceof Error ? error.message : "Action failed"),
    );
  }
}
