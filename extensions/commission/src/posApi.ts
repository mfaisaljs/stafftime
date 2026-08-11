import { resolveAppUrl } from "./appUrl";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  type CommissionOrderAttribution,
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

export async function fetchCommissionAttributionStatus(params: {
  orderId: string | number;
  employeeId?: string;
  programIds?: string[];
}): Promise<CommissionOrderAttribution> {
  return (await apiFetch("/api/pos/commission/attribution", {
    intent: params.employeeId ? "preview" : "status",
    orderId: params.orderId,
    employeeId: params.employeeId,
    programIds: params.programIds ?? [],
  })) as CommissionOrderAttribution;
}

export async function attributeOrderToCommission(params: {
  employeeId: string;
  orderId: string | number;
  programIds: string[];
}): Promise<CommissionOrderAttribution> {
  return (await apiFetch("/api/pos/commission/attribution", {
    intent: "attribute",
    employeeId: params.employeeId,
    orderId: params.orderId,
    programIds: params.programIds,
  })) as CommissionOrderAttribution;
}

export async function persistCommissionSession(
  data: VerifyResponse,
): Promise<void> {
  await shopify.storage.set(ACTIVE_SESSION_STORAGE_KEY, {
    employee: data.employee,
  });
}

/** Clear prior session, show native PIN pad, then open the action modal on accept. */
export async function promptPinThenPresentModal(
  pinPadOpenRef: { current: boolean },
): Promise<void> {
  try {
    await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // Still prompt for PIN.
  }

  const openModal = () => {
    shopify.action.presentModal();
  };

  if (pinPadOpenRef.current) return;

  if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
    openModal();
    return;
  }

  pinPadOpenRef.current = true;
  try {
    shopify.pinPad.showPinPad(
      async (pinDigits) => {
        const pin = pinDigits.join("");
        try {
          const data = await verifyPin(pin);
          await persistCommissionSession(data);
          showToast(`Welcome, ${data.employee.firstName}`);
          return { result: "accept" as const };
        } catch (err) {
          return {
            result: "reject" as const,
            errorMessage: messageFromError(err, "Invalid PIN"),
          };
        }
      },
      {
        title: "Enter PIN",
        label: "Enter your PIN",
        masked: true,
        minPinLength: 4,
        maxPinLength: 4,
        autoSubmit: true,
        onDismissed: (result) => {
          pinPadOpenRef.current = false;
          if (result.completed) {
            openModal();
          }
        },
      },
    );
  } catch {
    pinPadOpenRef.current = false;
    openModal();
  }
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
