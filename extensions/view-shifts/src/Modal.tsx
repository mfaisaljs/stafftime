import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  fetchShifts,
  messageFromError,
  persistShiftSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredShiftSession,
  type PosShiftRange,
  type PosShiftRow,
  type ShiftEmployee,
} from "./session";

const TABS: Array<{ id: PosShiftRange; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

export default async function extension() {
  render(<ViewShiftsModal />, document.body);
}

function ViewShiftsModal() {
  const [employee, setEmployee] = useState<ShiftEmployee | null>(null);
  const [range, setRange] = useState<PosShiftRange>("upcoming");
  const [shifts, setShifts] = useState<PosShiftRow[]>([]);
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
    setShifts([]);
  }, []);

  const loadShifts = useCallback(
    async (nextEmployee: ShiftEmployee, nextRange: PosShiftRange) => {
      setLoading(true);
      try {
        const data = await fetchShifts(nextEmployee.id, nextRange);
        setShifts(data.shifts);
      } catch (err) {
        showToast(messageFromError(err, "Could not load shifts"));
        setShifts([]);
      } finally {
        setLoading(false);
      }
    },
    [],
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
            await persistShiftSession(data);
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
                const stored = parseStoredShiftSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                setRange("upcoming");
                await loadShifts(stored.employee, "upcoming");
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadShifts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredShiftSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          setRange("upcoming");
          await loadShifts(stored.employee, "upcoming");
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
  }, [loadShifts]);

  const onSelectRange = useCallback(
    (nextRange: PosShiftRange) => {
      setRange(nextRange);
      if (employee) {
        void loadShifts(employee, nextRange);
      }
    },
    [employee, loadShifts],
  );

  const handleTabsChange = useCallback(
    (event: { currentTarget: { value?: string | null } }) => {
      const next = event.currentTarget.value;
      if (!isPosShiftRange(next) || next === range) return;
      onSelectRange(next);
    },
    [onSelectRange, range],
  );

  if (booting) {
    return (
      <s-page heading="View Shifts">
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
      <s-page heading="View Shifts">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>Enter your staff PIN to view your shifts.</s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  const shiftList =
    loading ? (
      <s-text>Loading shifts…</s-text>
    ) : shifts.length === 0 ? (
      <s-text>No shifts in this range.</s-text>
    ) : (
      <s-stack direction="block" gap="base">
        {shifts.map((shift) => (
          <ShiftRow key={shift.id} shift={shift} />
        ))}
      </s-stack>
    );

  return (
    <s-page
      heading={`${
        employee.firstName.endsWith("s") || employee.firstName.endsWith("S")
          ? `${employee.firstName}'`
          : `${employee.firstName}'s`
      } Shifts`}
    >
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-tabs value={range} onChange={handleTabsChange}>
              <s-tab-list>
                {TABS.map((tab) => (
                  <s-tab key={tab.id} controls={tab.id}>
                    {tab.label}
                  </s-tab>
                ))}
              </s-tab-list>
              {TABS.map((tab) => (
                <s-tab-panel key={tab.id} id={tab.id}>
                  <s-box padding="base none">{shiftList}</s-box>
                </s-tab-panel>
              ))}
            </s-tabs>

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

function isPosShiftRange(value: unknown): value is PosShiftRange {
  return (
    value === "upcoming" ||
    value === "today" ||
    value === "week" ||
    value === "month"
  );
}

function ShiftRow(props: { shift: PosShiftRow }) {
  const { shift } = props;
  return (
    <s-box padding="small none">
      <s-stack direction="block" gap="small">
        <s-stack
          direction="inline"
          gap="small"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-icon type="clock" color="strong" />
            <s-text type="strong">{shift.dateLabel}</s-text>
            <s-badge tone="neutral">{shift.dayLabel}</s-badge>
          </s-stack>
        </s-stack>
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
          inlineSize="100%"
        >
          <s-heading>{shift.timeRangeLabel}</s-heading>
          <s-badge tone={shift.tone}>{shift.statusLabel}</s-badge>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
