import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  attributeOrderToSalesTarget,
  fetchOrderAttributionStatus,
  messageFromError,
  persistSalesTargetSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredSalesTargetSession,
  type SalesTargetEmployee,
  type SalesTargetOrderAttribution,
} from "./session";

export default async function extension() {
  render(<SalesTargetAttributionModal />, document.body);
}

function SalesTargetAttributionModal() {
  const orderId = shopify.order?.id;
  const orderName =
    typeof shopify.order?.name === "string" ? shopify.order.name : "Order";

  const [employee, setEmployee] = useState<SalesTargetEmployee | null>(null);
  const [status, setStatus] = useState<SalesTargetOrderAttribution | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [attributing, setAttributing] = useState(false);
  const pinPadOpenRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (orderId === undefined || orderId === null) return;
    setLoading(true);
    try {
      const next = await fetchOrderAttributionStatus(orderId);
      setStatus(next);
    } catch (err) {
      showToast(messageFromError(err, "Could not load order attribution"));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

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
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, []);

  const attributeSale = useCallback(async () => {
    if (!employee || orderId === undefined || orderId === null) return;
    setAttributing(true);
    try {
      const result = await attributeOrderToSalesTarget({
        employeeId: employee.id,
        orderId,
      });
      setStatus(result);
      showToast(`Attributed ${result.amountLabel} to ${employee.firstName}`);
    } catch (err) {
      showToast(messageFromError(err, "Could not attribute sale"));
    } finally {
      setAttributing(false);
    }
  }, [employee, orderId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadStatus();
        const stored = parseStoredSalesTargetSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
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
      <s-page heading="Sales Target">
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
      <s-page heading="Sales Target">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Order is not available yet. Try again in a moment.</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  return (
    <s-page heading="Sales Target">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>{status?.orderName || orderName}</s-heading>
              <s-text>
                {loading
                  ? "Loading order total…"
                  : `Sale amount: ${status?.amountLabel ?? "—"}`}
              </s-text>
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
                    <s-text>{status.amountLabel} credited to monthly target</s-text>
                  </s-stack>
                </s-box>
              </s-section>
            ) : !employee ? (
              <s-stack direction="block" gap="base">
                <s-text>Enter your staff PIN to attribute this sale.</s-text>
                <s-button variant="primary" onClick={showNativePinPad}>
                  Enter PIN
                </s-button>
              </s-stack>
            ) : (
              <s-section heading="Attribute sale">
                <s-box padding="small none">
                  <s-stack direction="block" gap="base">
                    <s-text type="strong">
                      Credit this sale to {employee.firstName}{" "}
                      {employee.lastName}.
                    </s-text>
                    <s-button
                      variant="primary"
                      disabled={attributing || loading}
                      onClick={() => {
                        void attributeSale();
                      }}
                    >
                      {attributing ? "Attributing…" : "Attribute to my target"}
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
                          showNativePinPad();
                        })();
                      }}
                    >
                      Switch employee
                    </s-button>
                  </s-stack>
                </s-box>
              </s-section>
            )}
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
