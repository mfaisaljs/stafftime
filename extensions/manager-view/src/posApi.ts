import { resolveAppUrl } from "./appUrl";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  type ManagerBootstrap,
  type ManagerStaffDetail,
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

export async function bootstrapManagerView(
  managerId: string,
): Promise<ManagerBootstrap> {
  return (await apiFetch("/api/pos/manager-view", {
    intent: "bootstrap",
    managerId,
  })) as ManagerBootstrap;
}

export async function fetchManagerStaffDetail(params: {
  managerId: string;
  staffId: string;
  start: string;
  end: string;
  days?: number;
}): Promise<ManagerStaffDetail> {
  return (await apiFetch("/api/pos/manager-view", {
    intent: "detail",
    managerId: params.managerId,
    staffId: params.staffId,
    start: params.start,
    end: params.end,
    days: params.days,
  })) as ManagerStaffDetail;
}

export async function managerClockAction(params: {
  managerId: string;
  staffId: string;
  action: "clock-in" | "clock-out" | "break-start" | "break-end";
}): Promise<{ clockStatus: ManagerStaffDetail["clockStatus"] }> {
  return (await apiFetch("/api/pos/manager-view", {
    intent: "clock",
    managerId: params.managerId,
    staffId: params.staffId,
    action: params.action,
  })) as { clockStatus: ManagerStaffDetail["clockStatus"] };
}

export async function persistManagerSession(
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

export function showToast(content: string, _durationMs = 3000): void {
  try {
    if (shopify.toast && typeof shopify.toast.show === "function") {
      shopify.toast.show(content);
    }
  } catch {
    // Toast is best-effort feedback only.
  }
}
