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
import {
  captureClockInSelfie,
  captureClockOutSelfie,
  clearClockInPhoto,
  loadClockInPhoto,
  photoPayload,
  saveClockInPhoto,
  type CapturedPhoto,
} from "./clockPhoto";

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
  const [pendingClockOut, setPendingClockOut] = useState<CapturedPhoto | null>(null);

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
        settings: {
          requirePhoto: Boolean(data.settings?.requirePhoto),
        },
        serverTime: data.serverTime ?? data.status.serverTime,
      };
      syncClockOffset(next.status, next.serverTime);
      if (
        next.status.clockInPhotoFingerprint &&
        next.employee.id
      ) {
        void saveClockInPhoto(
          next.employee.id,
          next.status.clockInPhotoFingerprint,
        );
      }
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

  async function resolveClockInFingerprint(employeeId: string) {
    const stored = await loadClockInPhoto(employeeId);
    if (stored) return stored;
    if (
      verified?.employee.id === employeeId &&
      verified.status.clockInPhotoFingerprint
    ) {
      return verified.status.clockInPhotoFingerprint;
    }
    return "";
  }

  async function submitClockAction(
    action: string,
    photoPayload: { photo?: string; photoType?: string } = {},
  ) {
    if (!verified) return;
    const data = (await apiFetch(`/api/pos/${action}`, {
      employeeId: verified.employee.id,
      ...(action === "clock-out" && note.trim() ? { notes: note.trim() } : {}),
      ...photoPayload,
    })) as { status: EmployeeStatus; serverTime?: number };
    applyVerified({
      ...verified,
      status: data.status,
      serverTime: data.serverTime,
    });
  }

  async function performAction(action: string) {
    if (!verified) return;
    setLoading(true);
    try {
      if (action === "clock-out" && verified.settings?.requirePhoto) {
        const clockInFingerprint = await resolveClockInFingerprint(
          verified.employee.id,
        );
        const selfie = await captureClockOutSelfie(clockInFingerprint);
        setPendingClockOut(selfie);
        return;
      }

      let photoPayload: { photo?: string; photoType?: string } = {};
      if (action === "clock-in" && verified.settings?.requirePhoto) {
        const selfie = await captureClockInSelfie();
        await saveClockInPhoto(verified.employee.id, selfie.photo);
        photoPayload = { photo: selfie.photo, photoType: selfie.photoType };
      }

      await submitClockAction(action, photoPayload);

      if (action === "clock-out") {
        await clearClockInPhoto(verified.employee.id);
        setNote("");
      }
      showToast(successMessageForAction(action));
    } catch (err) {
      showToast(messageFromError(err, "Action failed"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmClockOut() {
    if (!verified || !pendingClockOut) return;
    setLoading(true);
    try {
      const clockInFingerprint = await resolveClockInFingerprint(
        verified.employee.id,
      );
      if (photoPayload(pendingClockOut.photo) === clockInFingerprint) {
        throw new Error(
          "Clock-out selfie matches clock-in. Retake the photo.",
        );
      }
      await submitClockAction("clock-out", {
        photo: pendingClockOut.photo,
        photoType: pendingClockOut.photoType,
      });
      await clearClockInPhoto(verified.employee.id);
      setPendingClockOut(null);
      setNote("");
      showToast(successMessageForAction("clock-out"));
    } catch (err) {
      showToast(messageFromError(err, "Action failed"));
    } finally {
      setLoading(false);
    }
  }

  async function retakeClockOut() {
    if (!verified) return;
    setLoading(true);
    try {
      const clockInFingerprint = await resolveClockInFingerprint(
        verified.employee.id,
      );
      const selfie = await captureClockOutSelfie(clockInFingerprint);
      setPendingClockOut(selfie);
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
    setPendingClockOut(null);
    setTimeout(() => showNativePinPad(), 0);
  }

  if (booting) {
    return (
      <s-page heading="Clock In/Out">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Loading...</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!verified || !status) {
    return (
      <s-page heading="Clock In/Out">
        <s-scroll-box>
          <s-box padding="large">
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
          </s-box>
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

  if (pendingClockOut) {
    return (
      <ClockOutPhotoScreen
        previewSrc={pendingClockOut.previewSrc}
        loading={loading}
        onRetake={() => void retakeClockOut()}
        onConfirm={() => void confirmClockOut()}
        onCancel={() => setPendingClockOut(null)}
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
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>👋 Welcome, {props.firstName}!</s-heading>
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-icon
                  color="strong"
                  type={statusCopy.icon}
                  tone={statusCopy.tone === "neutral" ? "auto" : statusCopy.tone}
                />
                <s-badge tone={statusCopy.tone}>{statusCopy.label}</s-badge>
              </s-stack>
            </s-stack>

            <s-section>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <SectionTitle emoji="⏰" label="Time Tracking" />
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
              </s-box>
            </s-section>

            <s-section>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <SectionTitle emoji="📌" label="Shift Info" />
                  <s-stack direction="block" gap="none">
                    <InfoRow
                      emoji="📅"
                      label="Date"
                      value={props.dateLabel}
                      showDivider
                    />
                    <InfoRow
                      emoji="📍"
                      label="Location"
                      value={props.locationName}
                      showDivider
                    />
                    <InfoRow
                      icon="clock"
                      label="First clock in today"
                      value={props.firstClockInLabel}
                      showDivider
                    />
                    <InfoRow
                      icon="clock"
                      label="Current clock in"
                      value={props.currentClockInLabel}
                    />
                  </s-stack>
                </s-stack>
              </s-box>
            </s-section>

            <s-section>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <SectionTitle emoji="⚡" label="Actions" />

                  <s-button variant="secondary" onClick={props.onViewHistory}>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-icon type="clipboard-checklist" color="strong" />
                      <s-text>View Today&apos;s History</s-text>
                    </s-stack>
                  </s-button>

                  {props.status === "CLOCKED_IN" && (
                    <s-button
                      variant="secondary"
                      loading={props.loading}
                      onClick={props.onBreakStart}
                    >
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-text>🍴</s-text>
                        <s-text>Start Break</s-text>
                      </s-stack>
                    </s-button>
                  )}

                  {props.status === "ON_BREAK" && (
                    <s-button
                      variant="primary"
                      loading={props.loading}
                      onClick={props.onBreakEnd}
                    >
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-text>🍴</s-text>
                        <s-text>End Break</s-text>
                      </s-stack>
                    </s-button>
                  )}

                  {(props.status === "CLOCKED_IN" ||
                    props.status === "ON_BREAK") && (
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
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-icon type="check-circle-filled" color="strong" />
                        <s-text>Clock In</s-text>
                      </s-stack>
                    </s-button>
                  ) : (
                    <s-button
                      variant="primary"
                      tone="critical"
                      loading={props.loading}
                      onClick={props.onClockOut}
                    >
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-icon type="phone-out" color="strong" tone="critical" />
                        <s-text>Clock Out</s-text>
                      </s-stack>
                    </s-button>
                  )}

                  <s-button variant="secondary" onClick={props.onSwitchEmployee}>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-icon type="person" color="strong" />
                      <s-text>Switch employee</s-text>
                    </s-stack>
                  </s-button>
                </s-stack>
              </s-box>
            </s-section>
          </s-stack>
        </s-box>
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
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-button variant="secondary" onClick={props.onBack}>
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-icon type="arrow-left" color="strong" />
                <s-text>Back to Main</s-text>
              </s-stack>
            </s-button>

            <s-section>
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <SectionTitle
                    icon="clipboard-checklist"
                    label="Time Records"
                  />
                  {props.history.length === 0 ? (
                    <s-text>No time records yet today.</s-text>
                  ) : (
                    props.history.map((event) => (
                      <s-stack
                        key={event.id}
                        direction="inline"
                        gap="base"
                        alignItems="center"
                        justifyContent="space-between"
                        inlineSize="100%"
                      >
                        <s-stack
                          direction="inline"
                          gap="small"
                          alignItems="center"
                        >
                          <s-text>{historyVisual(event.type).emoji}</s-text>
                          <s-stack direction="block" gap="none">
                            <s-text>{event.label}</s-text>
                            <s-text>Time: {event.atLabel}</s-text>
                          </s-stack>
                        </s-stack>
                        <s-badge tone={event.tone}>{event.badge}</s-badge>
                      </s-stack>
                    ))
                  )}
                </s-stack>
              </s-box>
            </s-section>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}

function SectionTitle(props: {
  icon?:
    | "live"
    | "flag"
    | "bolt-filled"
    | "clipboard-checklist"
    | "clock"
    | "location"
    | "note";
  emoji?: string;
  label: string;
}) {
  return (
    <s-stack direction="inline" gap="small" alignItems="center">
      {props.emoji ? <s-text>{props.emoji}</s-text> : null}
      {props.icon ? <s-icon type={props.icon} color="strong" /> : null}
      <s-text>{props.label}</s-text>
    </s-stack>
  );
}

function TimerRow(props: {
  label: string;
  value: string;
  running?: boolean;
}) {
  return (
    <s-box padding="small none">
      <s-stack direction="block" gap="none">
        <s-stack
          direction="inline"
          gap="small"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-text>{props.label}</s-text>
          {props.running ? <s-badge tone="success">Running</s-badge> : null}
        </s-stack>
        <s-heading>{props.value}</s-heading>
      </s-stack>
    </s-box>
  );
}

function InfoRow(props: {
  label: string;
  value: string;
  icon?: "clock" | "location" | "note" | "flag" | "store";
  emoji?: string;
  showDivider?: boolean;
}) {
  return (
    <s-stack direction="block" gap="none">
      <s-box padding="small none">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-stack direction="inline" gap="small" alignItems="center">
            {props.emoji ? <s-text>{props.emoji}</s-text> : null}
            {props.icon ? (
              <s-icon type={props.icon} color="strong" />
            ) : null}
            <s-text>{props.label}</s-text>
          </s-stack>
          <s-text>{props.value}</s-text>
        </s-stack>
      </s-box>
      {props.showDivider ? <s-divider /> : null}
    </s-stack>
  );
}

function historyVisual(type: PosHistoryEvent["type"]): {
  emoji: string;
} {
  switch (type) {
    case "CLOCK_IN":
    case "CLOCK_OUT":
      return { emoji: "🕰️" };
    case "BREAK_START":
    case "BREAK_END":
      return { emoji: "🍴" };
  }
}

function statusBadgeCopy(status: ClockStatus): {
  label: string;
  tone: "success" | "warning" | "critical" | "neutral";
  icon: "check-circle-filled" | "play-circle" | "x-circle";
} {
  if (status === "CLOCKED_IN") {
    return {
      label: "Currently Working",
      tone: "success",
      icon: "check-circle-filled",
    };
  }
  if (status === "ON_BREAK") {
    return { label: "On Break", tone: "warning", icon: "play-circle" };
  }
  return { label: "Clocked Out", tone: "critical", icon: "x-circle" };
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

function ClockOutPhotoScreen(props: {
  previewSrc: string;
  loading: boolean;
  onRetake: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <s-page heading="Clock out selfie">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-text>
              Confirm this is a new selfie for clock-out. It must be different
              from your clock-in photo.
            </s-text>
            <s-image src={props.previewSrc} />
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-button
                variant="secondary"
                disabled={props.loading}
                onClick={props.onRetake}
              >
                Retake
              </s-button>
              <s-button
                variant="primary"
                loading={props.loading}
                disabled={props.loading}
                onClick={props.onConfirm}
              >
                Use photo & clock out
              </s-button>
            </s-stack>
            <s-button variant="secondary" disabled={props.loading} onClick={props.onCancel}>
              Cancel
            </s-button>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
