import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  attributeOrderToCommission,
  fetchCommissionAttributionStatus,
  messageFromError,
  persistCommissionSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredCommissionSession,
  type CommissionEmployee,
  type CommissionOrderAttribution,
} from "./session";

export default async function extension() {
  render(<CommissionAttributionModal />, document.body);
}

function CommissionAttributionModal() {
  const orderId = shopify.order?.id;
  const orderName =
    typeof shopify.order?.name === "string" ? shopify.order.name : "Order";

  const [employee, setEmployee] = useState<CommissionEmployee | null>(null);
  const [status, setStatus] = useState<CommissionOrderAttribution | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [attributing, setAttributing] = useState(false);
  const pinPadOpenRef = useRef(false);

  const loadStatus = useCallback(
    async (nextEmployee?: CommissionEmployee | null) => {
      if (orderId === undefined || orderId === null) return;
      setLoading(true);
      try {
        const next = await fetchCommissionAttributionStatus({
          orderId,
          employeeId: nextEmployee?.id,
        });
        setStatus(next);
      } catch (err) {
        showToast(messageFromError(err, "Could not load commission"));
      } finally {
        setLoading(false);
      }
    },
    [orderId],
  );

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
              void (async () => {
                const stored = parseStoredCommissionSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                await loadStatus(stored.employee);
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadStatus]);

  const attributeCommission = useCallback(async () => {
    if (!employee || orderId === undefined || orderId === null) return;
    setAttributing(true);
    try {
      const result = await attributeOrderToCommission({
        employeeId: employee.id,
        orderId,
      });
      setStatus(result);
      showToast(
        `Attributed ${result.commissionLabel} to ${employee.firstName}`,
      );
    } catch (err) {
      showToast(messageFromError(err, "Could not attribute commission"));
    } finally {
      setAttributing(false);
    }
  }, [employee, orderId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredCommissionSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          await loadStatus(stored.employee);
        } else if (!cancelled) {
          await loadStatus(null);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  if (booting) {
    return (
      <s-page heading="Commission">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Loading…</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (orderId === undefined || orderId === null) {
    return (
      <s-page heading="Commission">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Order is not available yet. Try again in a moment.</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  return (
    <s-page heading="Commission">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>{status?.orderName || orderName}</s-heading>
              {loading ? <s-text>Calculating commission…</s-text> : null}
            </s-stack>

            {status?.attributed ? (
              <s-section heading="Attribution">
                <s-box padding="small none">
                  <s-stack direction="block" gap="base">
                    <s-badge tone="success">Attributed</s-badge>
                    <s-text type="strong">
                      {status.attributedTo
                        ? `${status.attributedTo.firstName} ${status.attributedTo.lastName}`
                        : "Staff member"}
                    </s-text>
                    <s-text type="strong">{status.commissionLabel}</s-text>
                    {status.programNames.length > 0 ? (
                      <s-text>
                        Programs: {status.programNames.join(", ")}
                      </s-text>
                    ) : null}
                  </s-stack>
                </s-box>
              </s-section>
            ) : !employee ? (
              <s-stack direction="block" gap="base">
                <s-text>
                  Enter your staff PIN to calculate commission from your program
                  product rules.
                </s-text>
                <s-button variant="primary" onClick={showNativePinPad}>
                  Enter PIN
                </s-button>
              </s-stack>
            ) : (
              <s-stack direction="block" gap="large">
                <s-section heading="Estimated commission">
                  <s-box padding="small none">
                    <s-stack direction="block" gap="base">
                      <s-text type="strong">
                        {employee.firstName} {employee.lastName}
                      </s-text>
                      {status?.message ? (
                        <s-text>{status.message}</s-text>
                      ) : (
                        <s-text type="strong">
                          {status?.commissionLabel ?? "—"}
                        </s-text>
                      )}
                      {status?.programNames?.length ? (
                        <s-text>
                          Programs: {status.programNames.join(", ")}
                        </s-text>
                      ) : null}
                    </s-stack>
                  </s-box>
                </s-section>

                {status?.lines?.length ? (
                  <s-section heading="Product rules">
                    <s-box padding="small none">
                      <s-stack direction="block" gap="base">
                        {status.lines.map((line, index) => (
                          <s-stack
                            key={`${line.programId}-${line.productId}-${index}`}
                            direction="block"
                            gap="small"
                          >
                            {index > 0 ? <s-divider /> : null}
                            <s-text type="strong">{line.title}</s-text>
                            <s-text>
                              {line.programName} · qty {line.quantity} ·{" "}
                              {line.commissionType === "percentage"
                                ? `${line.rate}%`
                                : `USD ${line.rate.toFixed(2)} each`}
                            </s-text>
                            <s-text type="strong">
                              USD {line.commissionAmount.toFixed(2)}
                            </s-text>
                          </s-stack>
                        ))}
                      </s-stack>
                    </s-box>
                  </s-section>
                ) : null}

                <s-stack direction="block" gap="base">
                  <s-button
                    variant="primary"
                    disabled={
                      attributing ||
                      loading ||
                      !status?.eligible ||
                      (status?.commissionTotal ?? 0) <= 0
                    }
                    onClick={() => {
                      void attributeCommission();
                    }}
                  >
                    {attributing
                      ? "Attributing…"
                      : "Attribute commission"}
                  </s-button>
                  <s-button
                    variant="secondary"
                    disabled={attributing}
                    onClick={() => {
                      void (async () => {
                        try {
                          await shopify.storage.delete(
                            ACTIVE_SESSION_STORAGE_KEY,
                          );
                        } catch {
                          // ignore
                        }
                        setEmployee(null);
                        setStatus(null);
                        await loadStatus(null);
                        showNativePinPad();
                      })();
                    }}
                  >
                    Switch employee
                  </s-button>
                </s-stack>
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
