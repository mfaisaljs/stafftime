import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  fetchStaffProfile,
  messageFromError,
  persistProfileSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredProfileSession,
  rangeForDays,
  type ProfileEmployee,
  type ProfileShiftRow,
  type StaffProfileResponse,
  type StaffProfileTab,
} from "./session";

const TABS: Array<{ id: StaffProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "shifts", label: "Shifts" },
  { id: "payroll", label: "Payroll" },
];

const DAY_PRESETS = [7, 30, 90] as const;

export default async function extension() {
  render(<StaffProfileModal />, document.body);
}

function StaffProfileModal() {
  const initialRange = rangeForDays(7);
  const [employee, setEmployee] = useState<ProfileEmployee | null>(null);
  const [tab, setTab] = useState<StaffProfileTab>("overview");
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [days, setDays] = useState(7);
  const [profile, setProfile] = useState<StaffProfileResponse | null>(null);
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
    setProfile(null);
  }, []);

  const loadProfile = useCallback(
    async (
      nextEmployee: ProfileEmployee,
      nextStart: string,
      nextEnd: string,
      nextDays?: number,
    ) => {
      setLoading(true);
      try {
        const data = await fetchStaffProfile({
          employeeId: nextEmployee.id,
          start: nextStart,
          end: nextEnd,
          days: nextDays,
        });
        setProfile(data);
        setStart(data.range.start);
        setEnd(data.range.end);
        setDays(data.range.days || nextDays || 0);
        setEmployee({
          ...nextEmployee,
          roleLabel: data.employee.roleLabel ?? nextEmployee.roleLabel,
        });
      } catch (err) {
        showToast(messageFromError(err, "Could not load staff profile"));
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
            await persistProfileSession(data);
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
                const stored = parseStoredProfileSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setEmployee(stored.employee);
                const range = rangeForDays(7);
                setStart(range.start);
                setEnd(range.end);
                setDays(7);
                await loadProfile(
                  stored.employee,
                  range.start,
                  range.end,
                  7,
                );
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredProfileSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setEmployee(stored.employee);
          const range = rangeForDays(7);
          await loadProfile(stored.employee, range.start, range.end, 7);
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
  }, [loadProfile]);

  const applyPreset = useCallback(
    (presetDays: number) => {
      const range = rangeForDays(presetDays);
      setStart(range.start);
      setEnd(range.end);
      setDays(presetDays);
      if (employee) {
        void loadProfile(employee, range.start, range.end, presetDays);
      }
    },
    [employee, loadProfile],
  );

  const updateData = useCallback(() => {
    if (!employee) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      showToast("Use dates as YYYY-MM-DD");
      return;
    }
    if (start > end) {
      showToast("Start date must be before end date");
      return;
    }
    setDays(0);
    void loadProfile(employee, start, end);
  }, [employee, end, loadProfile, start]);

  const handleTabsChange = useCallback(
    (event: { currentTarget: { value?: string | null } }) => {
      const next = event.currentTarget.value;
      if (next === "overview" || next === "shifts" || next === "payroll") {
        setTab(next);
      }
    },
    [],
  );

  if (booting) {
    return (
      <s-page heading="Staff Dashboard">
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
      <s-page heading="Staff Dashboard">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>Enter your staff PIN to open your profile.</s-text>
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
    <s-page heading="Staff Dashboard">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>
                👋 Welcome, {employee.firstName} {employee.lastName}!
              </s-heading>
              <s-badge tone="info">
                {employee.roleLabel ?? profile?.employee.roleLabel ?? "Staff"}
              </s-badge>
            </s-stack>

            <s-section heading="Date Range">
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <s-date-field
                    label="Start Date"
                    value={start}
                    onChange={(event) => {
                      setStart(event.currentTarget.value ?? "");
                      setDays(0);
                    }}
                  />
                  <s-date-field
                    label="End Date"
                    value={end}
                    onChange={(event) => {
                      setEnd(event.currentTarget.value ?? "");
                      setDays(0);
                    }}
                  />
                  <s-stack direction="inline" gap="small" alignItems="center">
                    {DAY_PRESETS.map((preset) => (
                      <s-button
                        key={preset}
                        variant={days === preset ? "primary" : "secondary"}
                        onClick={() => applyPreset(preset)}
                      >
                        {preset} Days
                      </s-button>
                    ))}
                  </s-stack>
                  <s-button
                    variant="primary"
                    loading={loading}
                    onClick={updateData}
                  >
                    Update Data
                  </s-button>
                </s-stack>
              </s-box>
            </s-section>

            <s-tabs value={tab} onChange={handleTabsChange}>
              <s-tab-list>
                {TABS.map((item) => (
                  <s-tab key={item.id} controls={item.id}>
                    {item.label}
                  </s-tab>
                ))}
              </s-tab-list>

              <s-tab-panel id="overview">
                <s-box padding="base none">
                  {profile ? (
                    <OverviewTab overview={profile.overview} />
                  ) : (
                    <s-text>Loading overview…</s-text>
                  )}
                </s-box>
              </s-tab-panel>

              <s-tab-panel id="shifts">
                <s-box padding="base none">
                  {profile ? (
                    <ShiftsTab shifts={profile.shifts} />
                  ) : (
                    <s-text>Loading shifts…</s-text>
                  )}
                </s-box>
              </s-tab-panel>

              <s-tab-panel id="payroll">
                <s-box padding="base none">
                  {profile ? (
                    <PayrollTab payroll={profile.payroll} />
                  ) : (
                    <s-text>Loading payroll…</s-text>
                  )}
                </s-box>
              </s-tab-panel>
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

function MetricRow(props: { label: string; value: string }) {
  return (
    <s-stack
      direction="inline"
      gap="base"
      alignItems="center"
      justifyContent="space-between"
      inlineSize="100%"
    >
      <s-text>{props.label}</s-text>
      <s-text type="strong">{props.value}</s-text>
    </s-stack>
  );
}

function OverviewTab(props: {
  overview: StaffProfileResponse["overview"];
}) {
  const { overview } = props;
  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Hours Summary">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Total Hours" value={overview.totalHours} />
            <MetricRow label="Working Hours" value={overview.workingHours} />
            <MetricRow label="Break Time" value={overview.breakTime} />
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Attendance">
        <s-box padding="small none">
          <MetricRow
            label="Absent Days"
            value={String(overview.absentDays)}
          />
        </s-box>
      </s-section>

      <s-section heading="Earnings Summary">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Base Earnings" value={overview.baseEarnings} />
            <MetricRow
              label="Salary adjustments"
              value={overview.salaryAdjustment}
            />
            <MetricRow
              label="Total Commission"
              value={overview.totalCommission}
            />
            <MetricRow label="Total Bonus" value={overview.totalBonus} />
            <MetricRow label="Total Earnings" value={overview.totalEarnings} />
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Payment Status">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Paid Amount" value={overview.paidAmount} />
            <MetricRow
              label="Remaining Amount"
              value={overview.remainingAmount}
            />
          </s-stack>
        </s-box>
      </s-section>
    </s-stack>
  );
}

function PayrollTab(props: { payroll: StaffProfileResponse["payroll"] }) {
  const { payroll } = props;
  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Earnings Summary">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Base Earnings" value={payroll.baseEarnings} />
            <MetricRow
              label="Salary adjustments"
              value={payroll.salaryAdjustment}
            />
            <MetricRow label="Commission" value={payroll.commission} />
            <MetricRow label="Total Bonus" value={payroll.totalBonus} />
            <MetricRow label="Total Earnings" value={payroll.totalEarnings} />
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Payment Status">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Paid Amount" value={payroll.paidAmount} />
            <MetricRow
              label="Remaining Amount"
              value={payroll.remainingAmount}
            />
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Unpaid Details">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Unpaid Salary" value={payroll.unpaidSalary} />
            <MetricRow
              label="Unpaid Commission"
              value={payroll.unpaidCommission}
            />
          </s-stack>
        </s-box>
      </s-section>
    </s-stack>
  );
}

function ShiftsTab(props: {
  shifts: StaffProfileResponse["shifts"];
}) {
  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Upcoming Shifts">
        <s-box padding="small none">
          {props.shifts.upcoming.length === 0 ? (
            <s-text>No upcoming shifts in this range.</s-text>
          ) : (
            <s-stack direction="block" gap="base">
              {props.shifts.upcoming.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </s-stack>
          )}
        </s-box>
      </s-section>

      <s-section heading="Past Shifts">
        <s-box padding="small none">
          {props.shifts.past.length === 0 ? (
            <s-text>No past shifts in this range.</s-text>
          ) : (
            <s-stack direction="block" gap="base">
              {props.shifts.past.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </s-stack>
          )}
        </s-box>
      </s-section>
    </s-stack>
  );
}

/** POS s-text has no line-through; use combining stroke per character. */
function strikeThroughText(value: string) {
  return [...value].map((char) => `${char}\u0336`).join("");
}

function ShiftCard(props: { shift: ProfileShiftRow }) {
  const { shift } = props;
  const cancelled = Boolean(shift.cancelledForLeave);
  const dateLabel = cancelled
    ? strikeThroughText(shift.dateLabel)
    : shift.dateLabel;
  const timeRangeLabel = cancelled
    ? strikeThroughText(shift.timeRangeLabel)
    : shift.timeRangeLabel;
  const locationName = cancelled
    ? strikeThroughText(shift.locationName)
    : shift.locationName;

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
            <s-icon
              type="clock"
              color={cancelled ? "base" : "strong"}
              tone={cancelled ? "critical" : "auto"}
            />
            <s-text
              type={cancelled ? "generic" : "strong"}
              tone={cancelled ? "critical" : "auto"}
            >
              {dateLabel}
            </s-text>
          </s-stack>
          <s-badge tone={cancelled ? "critical" : shift.tone}>
            {shift.badge}
          </s-badge>
        </s-stack>
        <s-text tone={cancelled ? "critical" : "auto"}>{timeRangeLabel}</s-text>
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text>📍</s-text>
          <s-text tone={cancelled ? "critical" : "auto"}>{locationName}</s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
