import { render } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { resolveAppUrl } from "./appUrl";
import {
  buildClockState,
  CLOCK_STATE_STORAGE_KEY,
  type ClockStatus,
} from "./clockStatus";
import { PinKeypad } from "./PinKeypad";

type EmployeeStatus = {
  employeeId: string;
  employeeName: string;
  status: ClockStatus;
  clockInAt?: string;
  clockInAtMs?: number;
  breakStartAt?: string;
  shiftStart?: string;
  shiftEnd?: string;
  serverTime?: number;
  timeFormat?: "24H" | "12H";
  hourFormat?: "STANDARD" | "DECIMAL";
  payrollStats?: {
    hours: number;
    earnings: number;
    hoursLabel: string;
    earningsLabel: string;
  } | null;
};

type VerifyResponse = {
  employee: { id: string; firstName: string; lastName: string };
  status: EmployeeStatus;
  serverTime?: number;
};

const PIN_LENGTH = 4;

export default async function extension() {
  render(<WorkforceModal />, document.body);
}

function WorkforceModal() {
  const [pin, setPin] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [mode, setMode] = useState<"pin" | "qr">("pin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);
  const [now, setNow] = useState(Date.now());
  const clockOffsetRef = useRef(0);
  const verifyingPinRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const syncClockOffset = useCallback((status: EmployeeStatus, serverTime?: number) => {
    if (typeof serverTime !== "number") return;
    clockOffsetRef.current = serverTime - Date.now();
    if (typeof status.clockInAtMs === "number") return;
    if (status.clockInAt) {
      status.clockInAtMs = new Date(status.clockInAt).getTime();
    }
  }, []);

  const persistClockState = useCallback(
    async (status: ClockStatus, employeeId?: string) => {
      try {
        await shopify.storage.set(
          CLOCK_STATE_STORAGE_KEY,
          buildClockState(status, employeeId),
        );
      } catch {
        // Tile falls back to default subheading if storage write fails.
      }
    },
    [],
  );

  const elapsedLabel = useMemo(() => {
    const clockInAtMs = verified?.status.clockInAtMs;
    if (!clockInAtMs) return "Not clocked in";

    const adjustedNow = now + clockOffsetRef.current;
    const seconds = Math.max(0, Math.floor((adjustedNow - clockInAtMs) / 1000));
    return formatElapsed(seconds, verified?.status.hourFormat ?? "STANDARD");
  }, [now, verified?.status.clockInAtMs, verified?.status.hourFormat]);

  const apiFetch = useCallback(async (path: string, body?: Record<string, unknown>) => {
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
  }, []);

  const applyVerified = useCallback(
    async (data: VerifyResponse) => {
      syncClockOffset(data.status, data.serverTime);
      setVerified(data);
      setPin("");
      setQrCode("");
      setError(null);
      await persistClockState(data.status.status, data.employee.id);
    },
    [persistClockState, syncClockOffset],
  );

  const verifyPin = useCallback(
    async (nextPin: string) => {
      if (verifyingPinRef.current || nextPin.length !== PIN_LENGTH) return;
      verifyingPinRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const data = (await apiFetch("/api/pos/verify", { pin: nextPin })) as VerifyResponse;
        await applyVerified(data);
      } catch (err) {
        setError(messageFromError(err, "Invalid PIN"));
        setPin("");
      } finally {
        verifyingPinRef.current = false;
        setLoading(false);
      }
    },
    [apiFetch, applyVerified],
  );

  function handlePinChange(nextPin: string) {
    setError(null);
    setPin(nextPin);
    if (nextPin.length === PIN_LENGTH) {
      void verifyPin(nextPin);
    }
  }

  async function verifyWithQr() {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch("/api/pos/verify", { qrCode })) as VerifyResponse;
      await applyVerified(data);
    } catch (err) {
      setError(messageFromError(err, "Verification failed"));
    } finally {
      setLoading(false);
    }
  }

  async function performAction(action: string) {
    if (!verified) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch(`/api/pos/${action}`, {
        employeeId: verified.employee.id,
      })) as { status: EmployeeStatus; serverTime?: number };
      syncClockOffset(data.status, data.serverTime);
      setVerified({ ...verified, status: data.status, serverTime: data.serverTime });
      await persistClockState(data.status.status, verified.employee.id);
    } catch (err) {
      setError(messageFromError(err, "Action failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!verified) {
    return (
      <s-page heading="Enter PIN">
        <s-scroll-box>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-button
                variant={mode === "pin" ? "primary" : "secondary"}
                onClick={() => {
                  setMode("pin");
                  setError(null);
                }}
              >
                PIN
              </s-button>
              <s-button
                variant={mode === "qr" ? "primary" : "secondary"}
                onClick={() => {
                  setMode("qr");
                  setError(null);
                }}
              >
                QR Code
              </s-button>
            </s-stack>

            {mode === "pin" ? (
              <PinKeypad
                pin={pin}
                maxLength={PIN_LENGTH}
                disabled={loading}
                error={error}
                onChange={handlePinChange}
              />
            ) : (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="QR Code"
                  value={qrCode}
                  onInput={(event) => setQrCode(event.currentTarget.value)}
                />
                {error && <s-banner heading={error} tone="critical" />}
                <s-button
                  variant="primary"
                  loading={loading}
                  disabled={loading || !qrCode}
                  onClick={() => void verifyWithQr()}
                >
                  Continue
                </s-button>
              </s-stack>
            )}
          </s-stack>
        </s-scroll-box>
      </s-page>
    );
  }

  const status = verified.status;
  const statusLabel =
    status.status === "ON_BREAK"
      ? "On break"
      : status.status === "CLOCKED_IN"
        ? "Working"
        : "Clocked out";

  return (
    <s-page heading={`Hello, ${verified.employee.firstName}`}>
      <s-scroll-box>
        <s-stack direction="block" gap="base">
          <s-badge
            tone={
              status.status === "CLOCKED_IN"
                ? "success"
                : status.status === "ON_BREAK"
                  ? "warning"
                  : "critical"
            }
          >
            {statusLabel}
          </s-badge>
          <s-text>Shift timer: {elapsedLabel}</s-text>
          {status.payrollStats && (
            <s-text>
              Today: {status.payrollStats.hoursLabel} · $
              {status.payrollStats.earningsLabel}
            </s-text>
          )}
          {status.shiftStart && status.shiftEnd && (
            <s-text>
              Today&apos;s shift: {formatTime(status.shiftStart, status.timeFormat)} –{" "}
              {formatTime(status.shiftEnd, status.timeFormat)}
            </s-text>
          )}
          {error && <s-banner heading={error} tone="critical" />}
          <s-stack direction="inline" gap="base">
            {status.status === "CLOCKED_OUT" && (
              <s-button
                variant="primary"
                loading={loading}
                onClick={() => void performAction("clock-in")}
              >
                Clock In
              </s-button>
            )}
            {status.status === "CLOCKED_IN" && (
              <>
                <s-button
                  variant="secondary"
                  loading={loading}
                  onClick={() => void performAction("break-start")}
                >
                  Start Break
                </s-button>
                <s-button
                  variant="primary"
                  loading={loading}
                  onClick={() => void performAction("clock-out")}
                >
                  Clock Out
                </s-button>
              </>
            )}
            {status.status === "ON_BREAK" && (
              <>
                <s-button
                  variant="primary"
                  loading={loading}
                  onClick={() => void performAction("break-end")}
                >
                  End Break
                </s-button>
                <s-button
                  variant="secondary"
                  loading={loading}
                  onClick={() => void performAction("clock-out")}
                >
                  Clock Out
                </s-button>
              </>
            )}
          </s-stack>
          <s-button
            variant="secondary"
            onClick={() => {
              setVerified(null);
              setPin("");
              setError(null);
              setMode("pin");
            }}
          >
            Switch employee
          </s-button>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

function formatTime(iso: string, timeFormat: "24H" | "12H" = "12H") {
  const date = new Date(iso);
  if (timeFormat === "24H") {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatElapsed(
  totalSeconds: number,
  hourFormat: "STANDARD" | "DECIMAL" = "STANDARD",
) {
  if (hourFormat === "DECIMAL") {
    return `${(totalSeconds / 3600).toFixed(2)}h`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function errorMessageFromResponse(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;

  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : null;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
