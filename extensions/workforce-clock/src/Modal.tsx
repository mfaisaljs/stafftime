import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  formatTimerHms,
  liveTimerSeconds,
  parseStoredVerifySession,
  type ClockStatus,
  type EmployeeStatus,
  type PosHistoryEvent,
} from "./clockStatus";
import {
  apiFetch,
  messageFromError,
  persistVerifySession,
  showToast,
  type VerifyResponse,
  verifyPin,
} from "./posApi";

type Screen = "main" | "history";

export default async function extension() {
  render(<WorkforceModal />, document.body);
}

function WorkforceModal() {
  const [qrCode, setQrCode] = useState("");
  const [mode, setMode] = useState<"pin" | "qr">("pin");
  const [screen, setScreen] = useState<Screen>("main");
  const [note, setNote] = useState("");
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
        serverTime: data.serverTime ?? data.status.serverTime,
      };
      syncClockOffset(next.status, next.serverTime);
      setVerified(next);
      setQrCode("");
      setMode("pin");
      setScreen("main");
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredVerifySession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          syncClockOffset(stored.status, stored.serverTime);
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

  const adjustedNow = now + clockOffsetRef.current;
  const status = verified?.status;
  const isRunning = Boolean(status?.isRunning);
  const dayTimer = formatTimerHms(
    liveTimerSeconds(
      status?.dayTotalSeconds,
      status?.serverTime ?? verified?.serverTime,
      adjustedNow,
      isRunning,
    ),
  );
  const sessionTimer = formatTimerHms(
    liveTimerSeconds(
      status?.sessionSeconds,
      status?.serverTime ?? verified?.serverTime,
      adjustedNow,
      isRunning,
    ),
  );
  const weekTimer = status?.weekTotalLabel ?? formatTimerHms(status?.weekTotalSeconds ?? 0);

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
        ...(action === "clock-out" && note.trim() ? { notes: note.trim() } : {}),
      })) as { status: EmployeeStatus; serverTime?: number };
      applyVerified({
        ...verified,
        status: data.status,
        serverTime: data.serverTime,
      });
      if (action === "clock-out") setNote("");
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
    setScreen("main");
    setNote("");
    setLoading(false);
    setTimeout(() => showNativePinPad(), 0);
  }

  if (booting) {
    return (
      <s-page heading="Clock In/Out">
        <s-scroll-box>
          <s-text>Loading...</s-text>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!verified || !status) {
    return (
      <s-page heading="Clock In/Out">
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

  if (screen === "history") {
    return (
      <HistoryScreen
        history={status.history ?? []}
        onBack={() => setScreen("main")}
      />
    );
  }

  return (
    <MainScreen
      firstName={verified.employee.firstName}
      status={status.status}
      dayTimer={dayTimer}
      sessionTimer={sessionTimer}
      weekTimer={weekTimer}
      isRunning={isRunning}
      dateLabel={status.dateLabel ?? "—"}
      locationName={status.locationName ?? "POS"}
      firstClockInLabel={status.firstClockInLabel ?? "—"}
      currentClockInLabel={status.currentClockInLabel ?? "—"}
      note={note}
      loading={loading}
      onNoteChange={setNote}
      onViewHistory={() => setScreen("history")}
      onClockIn={() => void performAction("clock-in")}
      onClockOut={() => void performAction("clock-out")}
      onBreakStart={() => void performAction("break-start")}
      onBreakEnd={() => void performAction("break-end")}
      onSwitchEmployee={switchEmployee}
    />
  );
}

function MainScreen(props: {
  firstName: string;
  status: ClockStatus;
  dayTimer: string;
  sessionTimer: string;
  weekTimer: string;
  isRunning: boolean;
  dateLabel: string;
  locationName: string;
  firstClockInLabel: string;
  currentClockInLabel: string;
  note: string;
  loading: boolean;
  onNoteChange: (value: string) => void;
  onViewHistory: () => void;
  onClockIn: () => void;
  onClockOut: () => void;
  onBreakStart: () => void;
  onBreakEnd: () => void;
  onSwitchEmployee: () => void;
}) {
  const statusCopy = statusBadgeCopy(props.status);

  return (
    <s-page heading="Clock In/Out">
      <s-scroll-box>
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-heading>Welcome, {props.firstName}!</s-heading>
            <s-badge tone={statusCopy.tone}>{statusCopy.label}</s-badge>
          </s-stack>

          <s-section heading="Time Tracking">
            <s-stack direction="block" gap="base">
              <TimerRow
                label="Day total"
                value={props.dayTimer}
                running={props.isRunning}
              />
              <TimerRow
                label="Current session"
                value={props.sessionTimer}
                running={props.isRunning}
              />
              <InfoRow label="Week total" value={props.weekTimer} />
            </s-stack>
          </s-section>

          <s-section heading="Shift Info">
            <s-stack direction="block" gap="base">
              <InfoRow label="Date" value={props.dateLabel} />
              <InfoRow label="Location" value={props.locationName} />
              <InfoRow
                label="First clock in today"
                value={props.firstClockInLabel}
              />
              <InfoRow
                label="Current clock in"
                value={props.currentClockInLabel}
              />
            </s-stack>
          </s-section>

          <s-section heading="Actions">
            <s-stack direction="block" gap="base">
              <s-button variant="secondary" onClick={props.onViewHistory}>
                View Today&apos;s History
              </s-button>

              {props.status === "CLOCKED_IN" && (
                <s-button
                  variant="secondary"
                  loading={props.loading}
                  onClick={props.onBreakStart}
                >
                  Start Break
                </s-button>
              )}

              {props.status === "ON_BREAK" && (
                <s-button
                  variant="primary"
                  loading={props.loading}
                  onClick={props.onBreakEnd}
                >
                  End Break
                </s-button>
              )}

              {(props.status === "CLOCKED_IN" || props.status === "ON_BREAK") && (
                <s-text-area
                  label="Note before clock out (optional)"
                  value={props.note}
                  placeholder="e.g. Forgot to clock out — actual end time was 6:00 PM"
                  onInput={(event) =>
                    props.onNoteChange(event.currentTarget.value)
                  }
                />
              )}

              {props.status === "CLOCKED_OUT" ? (
                <s-button
                  variant="primary"
                  loading={props.loading}
                  onClick={props.onClockIn}
                >
                  Clock In
                </s-button>
              ) : (
                <s-button
                  variant="primary"
                  tone="critical"
                  loading={props.loading}
                  onClick={props.onClockOut}
                >
                  Clock Out
                </s-button>
              )}

              <s-button variant="secondary" onClick={props.onSwitchEmployee}>
                Switch employee
              </s-button>
            </s-stack>
          </s-section>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

function HistoryScreen(props: {
  history: PosHistoryEvent[];
  onBack: () => void;
}) {
  return (
    <s-page heading="Today's History">
      <s-scroll-box>
        <s-stack direction="block" gap="base">
          <s-button variant="secondary" onClick={props.onBack}>
            Back to Main
          </s-button>

          <s-section heading="Time Records">
            <s-stack direction="block" gap="base">
              {props.history.length === 0 ? (
                <s-text>No time records yet today.</s-text>
              ) : (
                props.history.map((event) => (
                  <s-stack key={event.id} direction="inline" gap="base">
                    <s-stack direction="block" gap="none">
                      <s-text>{event.label}</s-text>
                      <s-text>Time: {event.atLabel}</s-text>
                    </s-stack>
                    <s-badge tone={event.tone}>{event.badge}</s-badge>
                  </s-stack>
                ))
              )}
            </s-stack>
          </s-section>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

function TimerRow(props: {
  label: string;
  value: string;
  running?: boolean;
}) {
  return (
    <s-stack direction="block" gap="none">
      <s-stack direction="inline" gap="small">
        <s-text>{props.label}</s-text>
        {props.running ? <s-badge tone="success">Running</s-badge> : null}
      </s-stack>
      <s-heading>{props.value}</s-heading>
    </s-stack>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <s-stack direction="inline" gap="base">
      <s-text>{props.label}</s-text>
      <s-text>{props.value}</s-text>
    </s-stack>
  );
}

function statusBadgeCopy(status: ClockStatus): {
  label: string;
  tone: "success" | "warning" | "critical" | "neutral";
} {
  if (status === "CLOCKED_IN") {
    return { label: "Currently Working", tone: "success" };
  }
  if (status === "ON_BREAK") {
    return { label: "On Break", tone: "warning" };
  }
  return { label: "Clocked Out", tone: "critical" };
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
