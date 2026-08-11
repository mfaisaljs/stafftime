import { resolveAppUrl } from "./appUrl";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  type SalesTargetOrderAttribution,
  type SalesTargetProgress,
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

export async function fetchSalesTarget(
  employeeId: string,
): Promise<SalesTargetProgress> {
  return (await apiFetch("/api/pos/sales-target", {
    employeeId,
  })) as SalesTargetProgress;
}

export async function fetchOrderAttributionStatus(
  orderId: string | number,
): Promise<SalesTargetOrderAttribution> {
  return (await apiFetch("/api/pos/sales-target/attribution", {
    intent: "status",
    orderId,
  })) as SalesTargetOrderAttribution;
}

export async function attributeOrderToSalesTarget(params: {
  employeeId: string;
  orderId: string | number;
}): Promise<SalesTargetOrderAttribution> {
  return (await apiFetch("/api/pos/sales-target/attribution", {
    intent: "attribute",
    employeeId: params.employeeId,
    orderId: params.orderId,
  })) as SalesTargetOrderAttribution;
}

export async function persistSalesTargetSession(
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
