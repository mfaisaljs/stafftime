import { resolveAppUrl } from "./appUrl";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  type TimeOffBootstrap,
  type TimeOffRequestRow,
  type VerifyResponse,
} from "./session";

export async function apiFetch(
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const token = await shopify.session.getSessionToken();
  if (!token) {
    throw new Error("POS session token unavailable. Check app permissions.");
  }

  let response: Response;
  try {
    response = await fetch(resolveAppUrl(path), {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(messageFromError(err, "Could not reach StaffTime server"));
  }

  const data = await response.json().catch((): null => null);
  if (!response.ok) {
    throw new Error(errorMessageFromResponse(data) ?? "Request failed");
  }
  return data;
}

export async function verifyPin(pin: string): Promise<VerifyResponse> {
  return (await apiFetch("/api/pos/verify", { pin })) as VerifyResponse;
}

export async function loadTimeOff(
  employeeId: string,
): Promise<TimeOffBootstrap> {
  return (await apiFetch("/api/pos/time-off", {
    intent: "load",
    employeeId,
  })) as TimeOffBootstrap;
}

export async function createTimeOffRequest(params: {
  employeeId: string;
  policyId: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<{ request: TimeOffRequestRow }> {
  return (await apiFetch("/api/pos/time-off", {
    intent: "create",
    ...params,
  })) as { request: TimeOffRequestRow };
}

export async function loadStaffTimeOff(params: {
  employeeId: string;
  targetEmployeeId: string;
}): Promise<{
  target: { id: string; name: string; roleLabel: string };
  requests: TimeOffRequestRow[];
}> {
  return (await apiFetch("/api/pos/time-off", {
    intent: "staff",
    ...params,
  })) as {
    target: { id: string; name: string; roleLabel: string };
    requests: TimeOffRequestRow[];
  };
}

export async function reviewTimeOffRequest(params: {
  employeeId: string;
  requestId: string;
  status: "APPROVED" | "DECLINED";
}): Promise<{ request: TimeOffRequestRow; message: string }> {
  return (await apiFetch("/api/pos/time-off", {
    intent: "review",
    ...params,
  })) as { request: TimeOffRequestRow; message: string };
}

export async function persistTimeOffSession(
  data: VerifyResponse,
): Promise<void> {
  await shopify.storage.set(ACTIVE_SESSION_STORAGE_KEY, {
    employee: data.employee,
  });
}

export function errorMessageFromResponse(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : null;
}

export function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function showToast(content: string, durationMs = 3000): void {
  try {
    if (shopify.toast && typeof shopify.toast.show === "function") {
      shopify.toast.show(content, { duration: durationMs });
    }
  } catch {
    // Toast is best-effort feedback only.
  }
}
