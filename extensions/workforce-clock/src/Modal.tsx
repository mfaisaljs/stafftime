import { render } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredVerifySession,
  type ClockStatus,
  type StoredVerifySession,
} from "./clockStatus";
import {
  apiFetch,
  messageFromError,
  persistVerifySession,
  showToast,
  type VerifyResponse,
  verifyPin,
} from "./posApi";

type EmployeeStatus = StoredVerifySession["status"] & {
  employeeId: string;
  employeeName: string;
  status: ClockStatus;
};

export default async function extension() {
  render(<WorkforceModal />, document.body);
}

function WorkforceModal() {
  const [qrCode, setQrCode] = useState("");
  const [mode, setMode] = useState<"pin" | "qr">("pin");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);
  const [now, setNow] = useState(Date.now());
  const clockOffsetRef = useRef(0);
  const pinPadOpenRef = useRef(false);

  const syncClockOffset = useCallback((status: EmployeeStatus, serverTime?: number) => {
    if (typeof serverTime === "number") {
      clockOffsetRef.current = serverTime - Date.now();
    }
    if (typeof status.clockInAtMs !== "number" && status.clockInAt) {
      status.clockInAtMs = new Date(status.clockInAt).getTime();
    }
  }, []);

  const clearSession = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const applyVerified = useCallback(
    (data: VerifyResponse, options?: { persist?: boolean }) => {
      const next: VerifyResponse = {
        employee: data.employee,
        status: { ...data.status },
        serverTime: data.serverTime,
      };
      syncClockOffset(next.status as EmployeeStatus, next.serverTime);
      setVerified(next);
      setQrCode("");
      setMode("pin");
      if (options?.persist !== false) {
        void persistVerifySession(next);
      }
    },
    [syncClockOffset],
  );

  const loadSessionIntoUi = useCallback(async () => {
    const stored = parseStoredVerifySession(
      await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
    );
    if (stored) {
      applyVerified(stored, { persist: false });
      return true;
    }
    return false;
  }, [applyVerified]);

  const showNativePinPad = useCallback(() => {
    if (pinPadOpenRef.current) return;

    if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
      showToast("PIN pad is unavailable on this POS version.");
      return;
    }

    setLoading(false);
    pinPadOpenRef.current = true;

    try {
      shopify.pinPad.showPinPad(
        async (pinDigits) => {
          const pin = pinDigits.join("");
          try {
            const data = await verifyPin(pin);
            await persistVerifySession(data);
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
            if (!result.completed) return;
            void loadSessionIntoUi();
          },
        },
      );
    } catch (err) {
      pinPadOpenRef.current = false;
      showToast(messageFromError(err, "Could not open PIN pad"));
    }
  }, [loadSessionIntoUi]);

  // Restore session written by the tile PIN pad (or a prior modal verify).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredVerifySession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          syncClockOffset(stored.status as EmployeeStatus, stored.serverTime);
          setVerified(stored);
        }
      } catch {
        // Start on fallback screen if restore fails.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedLabel = useMemo(() => {
    const clockInAtMs = verified?.status.clockInAtMs;
    if (!clockInAtMs) return "Not clocked in";

    const adjustedNow = now + clockOffsetRef.current;
    const seconds = Math.max(0, Math.floor((adjustedNow - clockInAtMs) / 1000));
    return formatElapsed(seconds, verified?.status.hourFormat ?? "STANDARD");
  }, [now, verified?.status.clockInAtMs, verified?.status.hourFormat]);

  async function verifyWithQr() {
    setLoading(true);
    try {
      const data = (await apiFetch("/api/pos/verify", { qrCode })) as VerifyResponse;
      applyVerified(data);
      showToast(`Welcome, ${data.employee.firstName}`);
    } catch (err) {
      showToast(messageFromError(err, "Verification failed"));
    } finally {
      setLoading(false);
    }
  }

  async function performAction(action: string) {
    if (!verified) return;
    setLoading(true);
    try {
      const data = (await apiFetch(`/api/pos/${action}`, {
        employeeId: verified.employee.id,
      })) as { status: EmployeeStatus; serverTime?: number };
      applyVerified({
        ...verified,
        status: data.status,
        serverTime: data.serverTime,
      });
      showToast(successMessageForAction(action));
    } catch (err) {
      showToast(messageFromError(err, "Action failed"));
    } finally {
      setLoading(false);
    }
  }

  function switchEmployee() {
    pinPadOpenRef.current = false;
    void clearSession();
    setVerified(null);
    setMode("pin");
    setLoading(false);
    // Open PIN pad immediately — no intermediate chooser step.
    setTimeout(() => showNativePinPad(), 0);
  }

  if (booting) {
    return (
      <s-page heading="StaffTime">
        <s-scroll-box>
          <s-text>Loading...</s-text>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!verified) {
    return (
      <s-page heading="StaffTime">
        <s-scroll-box>
          <s-stack direction="block" gap="base">
            <s-text>Enter your staff PIN to clock in or out.</s-text>
            <s-stack direction="inline" gap="base">
              <s-button
                variant={mode === "pin" ? "primary" : "secondary"}
                onClick={() => {
                  setMode("pin");
                  showNativePinPad();
                }}
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
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            ) : (
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="QR Code"
                  value={qrCode}
                  onInput={(event) => setQrCode(event.currentTarget.value)}
                />
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
              <s-stack direction="inline" gap="base">
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
              </s-stack>
            )}
            {status.status === "ON_BREAK" && (
              <s-stack direction="inline" gap="base">
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
              </s-stack>
            )}
          </s-stack>
          <s-button variant="secondary" onClick={switchEmployee}>
            Switch employee
          </s-button>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

function successMessageForAction(action: string): string {
  switch (action) {
    case "clock-in":
      return "Clocked in";
    case "clock-out":
      return "Clocked out";
    case "break-start":
      return "Break started";
    case "break-end":
      return "Break ended";
    default:
      return "Done";
  }
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
