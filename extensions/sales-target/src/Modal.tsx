import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  fetchSalesTarget,
  messageFromError,
  persistSalesTargetSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredSalesTargetSession,
  type SalesTargetEmployee,
  type SalesTargetProgress,
} from "./session";

export default async function extension() {
  render(<SalesTargetModal />, document.body);
}

function SalesTargetModal() {
  const [employee, setEmployee] = useState<SalesTargetEmployee | null>(null);
  const [progress, setProgress] = useState<SalesTargetProgress | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const pinPadOpenRef = useRef(false);

  const clearSession = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setEmployee(null);
    setProgress(null);
  }, []);

  const loadProgress = useCallback(async (nextEmployee: SalesTargetEmployee) => {
    setLoading(true);
    try {
      const data = await fetchSalesTarget(nextEmployee.id);
      setProgress(data);
      setEmployee({
        id: data.employee.id,
        firstName: data.employee.firstName,
        lastName: data.employee.lastName,
      });
    } catch (err) {
      showToast(messageFromError(err, "Could not load sales target"));
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const showNativePinPad = useCallback(() => {
    if (pinPadOpenRef.current) return;
    if (!shopify.pinPad || typeof shopify.pinPad.showPinPad !== "function") {
      showToast("PIN pad is unavailable on this POS version.");
      return;
    }

    pinPadOpenRef.current = true;
    try {
      shopify.pinPad.showPinPad(
        async (pinDigits) => {
          const pin = pinDigits.join("");
          try {
            const data = await verifyPin(pin);
            await persistSalesTargetSession(data);
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
              void (async () => {
                const stored = parseStoredSalesTargetSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                await loadProgress(stored.employee);
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadProgress]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredSalesTargetSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          await loadProgress(stored.employee);
        }
      } catch {
        // Stay on unlock UI.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProgress]);

  if (booting) {
    return (
      <s-page heading="Sales Targets">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Loading…</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!employee) {
    return (
      <s-page heading="Sales Targets">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>Enter your staff PIN to view your sales target.</s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  return (
    <s-page heading="Sales Targets">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>
                👋 {employee.firstName} {employee.lastName}
              </s-heading>
              <s-text>Your monthly sales target progress</s-text>
              {loading ? <s-text>Refreshing…</s-text> : null}
            </s-stack>

            {!progress || !progress.hasTarget ? (
              <s-section heading="Monthly Sales Target">
                <s-box padding="small none">
                  <s-text>
                    No sales target is assigned to you for this month.
                  </s-text>
                </s-box>
              </s-section>
            ) : (
              <s-section heading="Monthly Sales Target">
                <s-box padding="small none">
                  <s-stack direction="block" gap="base">
                    <ProgressRow label="Status">
                      <s-badge tone={progress.statusTone}>
                        {progress.status}
                      </s-badge>
                    </ProgressRow>
                    <s-divider />
                    <ProgressRow label="Sold this month">
                      <s-text type="strong">
                        {progress.soldLabel} / {progress.goalLabel}
                      </s-text>
                    </ProgressRow>
                    <s-divider />
                    <ProgressRow label="Progress">
                      <s-text type="strong">{progress.progressLabel}</s-text>
                    </ProgressRow>
                    <s-divider />
                    <ProgressRow label="Remaining">
                      <s-text type="strong">{progress.remainingLabel}</s-text>
                    </ProgressRow>
                  </s-stack>
                </s-box>
              </s-section>
            )}

            <s-button
              variant="secondary"
              onClick={() => {
                void clearSession();
              }}
            >
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-icon type="person" color="strong" />
                <s-text>Switch employee</s-text>
              </s-stack>
            </s-button>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}

function ProgressRow(props: {
  label: string;
  children: unknown;
}) {
  return (
    <s-stack
      direction="inline"
      gap="base"
      alignItems="center"
      justifyContent="space-between"
      inlineSize="100%"
    >
      <s-text>{props.label}</s-text>
      {props.children}
    </s-stack>
  );
}
