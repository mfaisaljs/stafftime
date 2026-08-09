import { render } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

type EmployeeStatus = {
  employeeId: string;
  employeeName: string;
  status: "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";
  clockInAt?: string;
  breakStartAt?: string;
  shiftStart?: string;
  shiftEnd?: string;
};

type VerifyResponse = {
  employee: { id: string; firstName: string; lastName: string };
  status: EmployeeStatus;
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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedLabel = useMemo(() => {
    if (!verified?.status.clockInAt) return "Not clocked in";
    const start = new Date(verified.status.clockInAt).getTime();
    const seconds = Math.max(0, Math.floor((now - start) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }, [now, verified?.status.clockInAt]);

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
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }, []);

  async function verifyEmployee() {
    setLoading(true);
    setError(null);
    try {
      const payload =
        mode === "pin" ? { pin } : { qrCode };
      const data = (await apiFetch("/api/pos/verify", payload)) as VerifyResponse;
      setVerified(data);
      setPin("");
      setQrCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
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
      })) as { status: EmployeeStatus };
      setVerified({ ...verified, status: data.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
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
            {error && <s-banner tone="critical">{error}</s-banner>}
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
          {status.shiftStart && status.shiftEnd && (
            <s-text>
              Today&apos;s shift: {formatTime(status.shiftStart)} –{" "}
              {formatTime(status.shiftEnd)}
            </s-text>
          )}
          {error && <s-banner tone="critical">{error}</s-banner>}
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

