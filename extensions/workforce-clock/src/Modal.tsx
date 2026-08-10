import { render } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

type EmployeeStatus = {
  employeeId: string;
  employeeName: string;
  status: "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";
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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const syncClockOffset = useCallback((status: EmployeeStatus, serverTime?: number) => {
    if (typeof serverTime !== "number") return;
    clockOffsetRef.current = serverTime - Date.now();
    if (typeof status.clockInAtMs === "number") {
      // Anchor timer to server time to avoid device clock drift.
      return;
    }
    if (status.clockInAt) {
      status.clockInAtMs = new Date(status.clockInAt).getTime();
    }
  }, []);

  const elapsedLabel = useMemo(() => {
    const clockInAtMs = verified?.status.clockInAtMs;
    if (!clockInAtMs) return "Not clocked in";

    const adjustedNow = now + clockOffsetRef.current;
    const seconds = Math.max(0, Math.floor((adjustedNow - clockInAtMs) / 1000));
    return formatElapsed(seconds, verified?.status.hourFormat ?? "STANDARD");
  }, [now, verified?.status.clockInAtMs, verified?.status.hourFormat]);

  const apiFetch = useCallback(async (path: string, body?: Record<string, unknown>) => {
    const token = await shopify.session.getSessionToken();
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch((): null => null);
    if (!response.ok) {
      throw new Error(errorMessageFromResponse(data) ?? "Request failed");
    }
    return data;
  }, []);

  async function verifyEmployee() {
    setLoading(true);
    setError(null);
    try {
      const payload = mode === "pin" ? { pin } : { qrCode };
      const data = (await apiFetch("/api/pos/verify", payload)) as VerifyResponse;
      syncClockOffset(data.status, data.serverTime);
      setVerified(data);
      setPin("");
      setQrCode("");
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
    } catch (err) {
      setError(messageFromError(err, "Action failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!verified) {
    return (
      <s-page heading="StaffTime">
        <s-scroll-box>
          <s-stack direction="block" gap="base">
            <s-text>Identify yourself to clock in or out.</s-text>
            <s-stack direction="inline" gap="base">
              <s-button
                variant={mode === "pin" ? "primary" : "secondary"}
                onClick={() => setMode("pin")}
              >
                PIN
              </s-button>
              <s-button
                variant={mode === "qr" ? "primary" : "secondary"}
                onClick={() => setMode("qr")}
              >
                QR Code
              </s-button>
            </s-stack>
            {mode === "pin" ? (
              <s-text-field
                label="Employee PIN"
                value={pin}
                onInput={(event) => setPin(event.currentTarget.value)}
              />
            ) : (
              <s-text-field
                label="QR Code"
                value={qrCode}
                onInput={(event) => setQrCode(event.currentTarget.value)}
              />
            )}
            {error && <s-banner heading={error} tone="critical" />}
            <s-button
              variant="primary"
              loading={loading}
              disabled={loading || (mode === "pin" ? pin.length < 4 : !qrCode)}
              onClick={() => void verifyEmployee()}
            >
              Continue
            </s-button>
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
          <s-button variant="secondary" onClick={() => setVerified(null)}>
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
