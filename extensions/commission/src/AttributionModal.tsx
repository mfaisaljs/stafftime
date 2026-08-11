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
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [attributing, setAttributing] = useState(false);
  const pinPadOpenRef = useRef(false);

  const loadStatus = useCallback(
    async (
      nextEmployee?: CommissionEmployee | null,
      programIds: string[] = [],
    ) => {
      if (orderId === undefined || orderId === null) return;
      setLoading(true);
      try {
        const next = await fetchCommissionAttributionStatus({
          orderId,
          employeeId: nextEmployee?.id,
          programIds,
        });
        setStatus(next);
        setSelectedProgramIds(next.selectedProgramIds ?? programIds);
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
                setSelectedProgramIds([]);
                await loadStatus(stored.employee, []);
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadStatus]);

  const onProgramSelectionChange = useCallback(
    (values: string[]) => {
      if (!employee) return;
      const available = status?.availablePrograms ?? [];
      let nextValues = values;

      // Single-select when only one program applies or multi is not allowed.
      if (!status?.allowMultiSelect && values.length > 1) {
        nextValues = values.slice(-1);
      }

      // Keep only programs that are available for this order.
      nextValues = nextValues.filter((id) =>
        available.some((program) => program.id === id),
      );

      setSelectedProgramIds(nextValues);
      void loadStatus(employee, nextValues);
    },
    [employee, loadStatus, status?.allowMultiSelect, status?.availablePrograms],
  );

  const attributeCommission = useCallback(async () => {
    if (!employee || orderId === undefined || orderId === null) return;
    if (selectedProgramIds.length === 0) {
      showToast("Select at least one commission program");
      return;
    }
    setAttributing(true);
    try {
      const result = await attributeOrderToCommission({
        employeeId: employee.id,
        orderId,
        programIds: selectedProgramIds,
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
  }, [employee, orderId, selectedProgramIds]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredCommissionSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          await loadStatus(stored.employee, []);
        } else if (!cancelled) {
          await loadStatus(null, []);
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

  const availablePrograms = status?.availablePrograms ?? [];

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
                <s-section heading="Select program">
                  <s-box padding="small none">
                    <s-stack direction="block" gap="base">
                      <s-text>
                        {status?.allowMultiSelect
                          ? "This order matches multiple programs. Select the programs to attribute."
                          : "Select a commission program for this order."}
                      </s-text>
                      {availablePrograms.length === 0 ? (
                        <s-text>
                          {status?.message ||
                            "No matching commission programs for this order."}
                        </s-text>
                      ) : (
                        <s-choice-list
                          values={selectedProgramIds}
                          multiple={Boolean(status?.allowMultiSelect)}
                          onChange={(event) => {
                            const values =
                              (
                                event.currentTarget as unknown as {
                                  values?: string[];
                                }
                              ).values ?? [];
                            onProgramSelectionChange(values);
                          }}
                        >
                          {availablePrograms.map((program) => {
                            const scopeLabel =
                              program.productScope === "specific"
                                ? "Specific products"
                                : "All products";
                            const itemLabel =
                              program.lineCount === 1 ? "1 item" : `${program.lineCount} items`;
                            const label = `${program.name} · ${program.commissionLabel} · ${scopeLabel} (${itemLabel})`;
                            return (
                              <s-choice key={program.id} value={program.id}>
                                {label}
                              </s-choice>
                            );
                          })}
                        </s-choice-list>
                      )}
                    </s-stack>
                  </s-box>
                </s-section>

                <s-section heading="Estimated commission">
                  <s-box padding="small none">
                    <s-stack direction="block" gap="base">
                      <s-text type="strong">
                        {employee.firstName} {employee.lastName}
                      </s-text>
                      {selectedProgramIds.length === 0 ? (
                        <s-text>
                          {status?.message || "Select a program to continue."}
                        </s-text>
                      ) : (
                        <s-text type="strong">
                          {status?.commissionLabel ?? "—"}
                        </s-text>
                      )}
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
                      selectedProgramIds.length === 0 ||
                      !status?.eligible ||
                      (status?.commissionTotal ?? 0) <= 0
                    }
                    onClick={() => {
                      void attributeCommission();
                    }}
                  >
                    {attributing ? "Attributing…" : "Attribute commission"}
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
                        setSelectedProgramIds([]);
                        await loadStatus(null, []);
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
