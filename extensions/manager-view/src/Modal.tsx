import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  bootstrapManagerView,
  fetchManagerStaffDetail,
  managerClockAction,
  messageFromError,
  persistManagerSession,
  showToast,
  verifyPin,
} from "./posApi";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  parseStoredManagerSession,
  rangeForDays,
  type DetailTab,
  type ManagerBootstrap,
  type ManagerEmployee,
  type ManagerStaffDetail,
  type ManagerStaffRow,
  type StaffListFilter,
  type StaffProfilePayload,
} from "./session";

const DAY_PRESETS = [7, 30, 90] as const;

const FILTERS: Array<{ id: StaffListFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "working", label: "Working" },
  { id: "on_break", label: "On break" },
  { id: "on_leave", label: "On leave" },
  { id: "absent", label: "Absent" },
  { id: "late", label: "Late" },
];

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "shifts", label: "Shifts" },
  { id: "payroll", label: "Payroll" },
];

export default async function extension() {
  render(<ManagerViewModal />, document.body);
}

function ManagerViewModal() {
  const [manager, setManager] = useState<ManagerEmployee | null>(null);
  const [bootstrap, setBootstrap] = useState<ManagerBootstrap | null>(null);
  const [filter, setFilter] = useState<StaffListFilter>("all");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ManagerStaffDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [start, setStart] = useState(rangeForDays(7).start);
  const [end, setEnd] = useState(rangeForDays(7).end);
  const [days, setDays] = useState(7);
  const [booting, setBooting] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [clockBusy, setClockBusy] = useState(false);
  const pinPadOpenRef = useRef(false);

  const clearSession = useCallback(async () => {
    try {
      await shopify.storage.delete(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setManager(null);
    setBootstrap(null);
    setSelectedStaffId(null);
    setDetail(null);
  }, []);

  const loadBootstrap = useCallback(async (nextManager: ManagerEmployee) => {
    setLoadingList(true);
    try {
      const data = await bootstrapManagerView(nextManager.id);
      setBootstrap(data);
      setManager({
        ...nextManager,
        roleLabel: data.manager.roleLabel ?? nextManager.roleLabel,
      });
    } catch (err) {
      showToast(messageFromError(err, "Could not load Manager View"));
      setBootstrap(null);
      setManager(null);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (
      nextManager: ManagerEmployee,
      staffId: string,
      nextStart: string,
      nextEnd: string,
      nextDays?: number,
    ) => {
      setLoadingDetail(true);
      try {
        const data = await fetchManagerStaffDetail({
          managerId: nextManager.id,
          staffId,
          start: nextStart,
          end: nextEnd,
          days: nextDays,
        });
        setDetail(data);
        setStart(data.profile.range.start || nextStart);
        setEnd(data.profile.range.end || nextEnd);
        const resolvedDays =
          typeof data.profile.range.days === "number" &&
          data.profile.range.days > 0
            ? data.profile.range.days
            : nextDays && nextDays > 0
              ? nextDays
              : 0;
        setDays(resolvedDays);
      } catch (err) {
        showToast(messageFromError(err, "Could not load staff details"));
      } finally {
        setLoadingDetail(false);
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
            await bootstrapManagerView(data.employee.id);
            await persistManagerSession(data);
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
          title: "Enter manager PIN",
          label: "Enter your PIN",
          masked: true,
          minPinLength: 4,
          maxPinLength: 4,
          autoSubmit: true,
          onDismissed: (result) => {
            pinPadOpenRef.current = false;
            if (result.completed) {
              void (async () => {
                const stored = parseStoredManagerSession(
                  await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
                );
                if (!stored) return;
                setManager(stored.employee);
                await loadBootstrap(stored.employee);
              })();
            }
          },
        },
      );
    } catch {
      pinPadOpenRef.current = false;
    }
  }, [loadBootstrap]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = parseStoredManagerSession(
          await shopify.storage.get(ACTIVE_SESSION_STORAGE_KEY),
        );
        if (!cancelled && stored) {
          setManager(stored.employee);
          await loadBootstrap(stored.employee);
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
  }, [loadBootstrap]);

  const openStaff = useCallback(
    (staffId: string) => {
      if (!manager) return;
      setSelectedStaffId(staffId);
      setTab("overview");
      const range = rangeForDays(7);
      setStart(range.start);
      setEnd(range.end);
      setDays(7);
      void loadDetail(manager, staffId, range.start, range.end, 7);
    },
    [loadDetail, manager],
  );

  const backToList = useCallback(() => {
    setSelectedStaffId(null);
    setDetail(null);
    if (manager) {
      void loadBootstrap(manager);
    }
  }, [loadBootstrap, manager]);

  const applyPreset = useCallback(
    (presetDays: number) => {
      if (!manager || !selectedStaffId) return;
      const range = rangeForDays(presetDays);
      setStart(range.start);
      setEnd(range.end);
      setDays(presetDays);
      void loadDetail(
        manager,
        selectedStaffId,
        range.start,
        range.end,
        presetDays,
      );
    },
    [loadDetail, manager, selectedStaffId],
  );

  const updateData = useCallback(() => {
    if (!manager || !selectedStaffId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      showToast("Use dates as YYYY-MM-DD");
      return;
    }
    if (start > end) {
      showToast("Start date must be before end date");
      return;
    }
    const matchedPreset =
      DAY_PRESETS.find((preset) => {
        const range = rangeForDays(preset);
        return range.start === start && range.end === end;
      }) ?? 0;
    setDays(matchedPreset);
    void loadDetail(
      manager,
      selectedStaffId,
      start,
      end,
      matchedPreset > 0 ? matchedPreset : undefined,
    );
  }, [end, loadDetail, manager, selectedStaffId, start]);

  const runClock = useCallback(
    async (action: "clock-in" | "clock-out" | "break-start" | "break-end") => {
      if (!manager || !selectedStaffId) return;
      setClockBusy(true);
      try {
        const result = await managerClockAction({
          managerId: manager.id,
          staffId: selectedStaffId,
          action,
        });
        setDetail((prev) =>
          prev ? { ...prev, clockStatus: result.clockStatus } : prev,
        );
        showToast(
          action === "clock-in"
            ? "Clocked in"
            : action === "clock-out"
              ? "Clocked out"
              : action === "break-start"
                ? "Break started"
                : "Break ended",
        );
      } catch (err) {
        showToast(messageFromError(err, "Clock action failed"));
      } finally {
        setClockBusy(false);
      }
    },
    [manager, selectedStaffId],
  );

  const handleDetailTabsChange = useCallback(
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
      <s-page heading="Manager View">
        <s-scroll-box>
          <s-box padding="large">
            <s-text>Loading…</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!manager || !bootstrap) {
    return (
      <s-page heading="Manager View">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="base">
              <s-text>
                Enter a manager PIN to monitor staff activity and manage
                attendance.
              </s-text>
              <s-button variant="primary" onClick={showNativePinPad}>
                Enter PIN
              </s-button>
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (selectedStaffId) {
    return (
      <s-page heading="Staff details">
        <s-scroll-box>
          <s-box padding="large">
            <s-stack direction="block" gap="large">
              <s-button variant="secondary" onClick={backToList}>
                ← Back to staff list
              </s-button>

              {loadingDetail && !detail ? (
                <s-text>Loading staff…</s-text>
              ) : detail ? (
                <>
                  <s-stack direction="block" gap="small">
                    <s-heading>{detail.details.fullName}</s-heading>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-badge tone="info">{detail.details.roleLabel}</s-badge>
                      <s-badge
                        tone={
                          detail.details.status === "ACTIVE"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {detail.details.statusLabel}
                      </s-badge>
                    </s-stack>
                  </s-stack>

                  <ClockActions
                    clockStatus={detail.clockStatus}
                    busy={clockBusy}
                    onAction={runClock}
                  />

                  <s-section heading="Personal information">
                    <s-box padding="small none">
                      <s-stack direction="block" gap="small">
                        <MetricRow
                          label="Staff type"
                          value={detail.details.staffType}
                        />
                        <MetricRow
                          label="Email"
                          value={detail.details.email || "—"}
                        />
                        <MetricRow
                          label="Phone"
                          value={detail.details.phone || "—"}
                        />
                        <MetricRow
                          label="Position"
                          value={detail.details.position || "—"}
                        />
                        <MetricRow
                          label="Hourly rate"
                          value={detail.details.hourlyRateLabel}
                        />
                        <MetricRow
                          label="Location"
                          value={detail.details.locationName || "—"}
                        />
                      </s-stack>
                    </s-box>
                  </s-section>

                  <s-section heading="Date range">
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
                        <s-stack
                          direction="inline"
                          gap="small"
                          alignItems="center"
                        >
                          {DAY_PRESETS.map((preset) => (
                            <s-button
                              key={preset}
                              variant={
                                days === preset ? "primary" : "secondary"
                              }
                              onClick={() => applyPreset(preset)}
                            >
                              {preset} Days
                            </s-button>
                          ))}
                        </s-stack>
                        <s-button
                          variant="primary"
                          loading={loadingDetail}
                          onClick={updateData}
                        >
                          Update Data
                        </s-button>
                      </s-stack>
                    </s-box>
                  </s-section>

                  <s-tabs value={tab} onChange={handleDetailTabsChange}>
                    <s-tab-list>
                      {DETAIL_TABS.map((item) => (
                        <s-tab key={item.id} controls={item.id}>
                          {item.label}
                        </s-tab>
                      ))}
                    </s-tab-list>

                    <s-tab-panel id="overview">
                      <s-box padding="base none">
                        <OverviewTab overview={detail.profile.overview} />
                      </s-box>
                    </s-tab-panel>
                    <s-tab-panel id="shifts">
                      <s-box padding="base none">
                        <ShiftsTab shifts={detail.profile.shifts} />
                      </s-box>
                    </s-tab-panel>
                    <s-tab-panel id="payroll">
                      <s-box padding="base none">
                        <PayrollTab payroll={detail.profile.payroll} />
                      </s-box>
                    </s-tab-panel>
                  </s-tabs>
                </>
              ) : (
                <s-text>Could not load this staff member.</s-text>
              )}
            </s-stack>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  const filteredStaff = filterStaff(bootstrap.staff, filter);

  return (
    <s-page heading="Manager View">
      <s-scroll-box>
        <s-box padding="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="small">
              <s-heading>
                👋 {manager.firstName} {manager.lastName}
              </s-heading>
              <s-badge tone="info">
                {manager.roleLabel ?? bootstrap.manager.roleLabel ?? "Manager"}
              </s-badge>
            </s-stack>

            <s-section heading="Today">
              <s-box padding="small none">
                <s-stack direction="block" gap="small">
                  <MetricRow
                    label="Working"
                    value={String(bootstrap.metrics.workingCount)}
                  />
                  <MetricRow
                    label="On break"
                    value={String(bootstrap.metrics.onBreakCount)}
                  />
                  <MetricRow
                    label="On leave"
                    value={String(bootstrap.metrics.onLeaveCount)}
                  />
                  <MetricRow
                    label="Absent"
                    value={String(bootstrap.metrics.absentCount)}
                  />
                  <MetricRow
                    label="Late"
                    value={String(bootstrap.metrics.lateCount)}
                  />
                </s-stack>
              </s-box>
            </s-section>

            <s-section heading="Staff">
              <s-box padding="small none">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    {FILTERS.map((item) => (
                      <s-button
                        key={item.id}
                        variant={filter === item.id ? "primary" : "secondary"}
                        onClick={() => setFilter(item.id)}
                      >
                        {item.label}
                      </s-button>
                    ))}
                  </s-stack>

                  {loadingList ? (
                    <s-text>Refreshing…</s-text>
                  ) : filteredStaff.length === 0 ? (
                    <s-text>No staff match this filter.</s-text>
                  ) : (
                    <s-stack direction="block" gap="base">
                      {filteredStaff.map((row) => (
                        <StaffRow
                          key={row.id}
                          row={row}
                          onSelect={() => openStaff(row.id)}
                        />
                      ))}
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            </s-section>

            <s-button
              variant="secondary"
              onClick={() => {
                void clearSession();
              }}
            >
              Switch manager
            </s-button>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}

function filterStaff(staff: ManagerStaffRow[], filter: StaffListFilter) {
  if (filter === "all") return staff;
  if (filter === "working") {
    // Anyone Working for the day (clocked in, on break, or clocked out after punching).
    return staff.filter(
      (row) => row.status === "working" || row.status === "on_break",
    );
  }
  if (filter === "on_break") {
    return staff.filter((row) => row.punchStatus === "ON_BREAK");
  }
  return staff.filter((row) => row.status === filter);
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

function StaffRow(props: { row: ManagerStaffRow; onSelect: () => void }) {
  const { row, onSelect } = props;
  const dayLabel =
    row.status === "on_break" || row.status === "working"
      ? "Working"
      : row.statusLabel;
  const dayTone =
    row.status === "on_break" || row.status === "working"
      ? "success"
      : row.statusTone;

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
          <s-stack direction="block" gap="none">
            <s-text type="strong">{row.name}</s-text>
            <s-text>
              {row.position}
              {row.location ? ` · ${row.location}` : ""}
            </s-text>
          </s-stack>
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge tone={dayTone}>{dayLabel}</s-badge>
            <s-badge tone={row.punchStatusTone}>{row.punchStatusLabel}</s-badge>
          </s-stack>
        </s-stack>
        {row.clockInLabel || row.clockOutLabel ? (
          <s-text>
            {row.clockInLabel ? `In ${row.clockInLabel}` : null}
            {row.clockInLabel && row.clockOutLabel ? " · " : null}
            {row.clockOutLabel ? `Out ${row.clockOutLabel}` : null}
          </s-text>
        ) : null}
        <s-button variant="secondary" onClick={onSelect}>
          View profile
        </s-button>
      </s-stack>
    </s-box>
  );
}

function ClockActions(props: {
  clockStatus: ManagerStaffDetail["clockStatus"];
  busy: boolean;
  onAction: (
    action: "clock-in" | "clock-out" | "break-start" | "break-end",
  ) => void;
}) {
  const { clockStatus, busy, onAction } = props;
  const status = clockStatus.status;

  return (
    <s-section heading="Clock in / out">
      <s-box padding="small none">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge
              tone={
                status === "CLOCKED_IN"
                  ? "success"
                  : status === "ON_BREAK"
                    ? "warning"
                    : "neutral"
              }
            >
              {status === "CLOCKED_IN"
                ? "Clocked in"
                : status === "ON_BREAK"
                  ? "On break"
                  : "Clocked out"}
            </s-badge>
            {clockStatus.sessionLabel ? (
              <s-text>Session {clockStatus.sessionLabel}</s-text>
            ) : null}
          </s-stack>
          {clockStatus.locationName ? (
            <s-text>📍 {clockStatus.locationName}</s-text>
          ) : null}
          {clockStatus.dayTotalLabel ? (
            <MetricRow label="Today" value={clockStatus.dayTotalLabel} />
          ) : null}

          <s-stack direction="inline" gap="small" alignItems="center">
            {status === "CLOCKED_OUT" ? (
              <s-button
                variant="primary"
                disabled={busy}
                onClick={() => onAction("clock-in")}
              >
                Clock in
              </s-button>
            ) : null}
            {status === "CLOCKED_IN" ? (
              <>
                <s-button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onAction("break-start")}
                >
                  Start break
                </s-button>
                <s-button
                  variant="primary"
                  disabled={busy}
                  onClick={() => onAction("clock-out")}
                >
                  Clock out
                </s-button>
              </>
            ) : null}
            {status === "ON_BREAK" ? (
              <>
                <s-button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onAction("break-end")}
                >
                  End break
                </s-button>
                <s-button
                  variant="primary"
                  disabled={busy}
                  onClick={() => onAction("clock-out")}
                >
                  Clock out
                </s-button>
              </>
            ) : null}
          </s-stack>

          {clockStatus.history && clockStatus.history.length > 0 ? (
            <s-stack direction="block" gap="small">
              <s-text type="strong">Today’s history</s-text>
              {clockStatus.history.map((event) => (
                <s-stack
                  key={event.id}
                  direction="inline"
                  gap="small"
                  alignItems="center"
                  justifyContent="space-between"
                  inlineSize="100%"
                >
                  <s-text>
                    {event.badge} {event.label}
                  </s-text>
                  <s-text>{event.atLabel}</s-text>
                </s-stack>
              ))}
            </s-stack>
          ) : null}
        </s-stack>
      </s-box>
    </s-section>
  );
}

function OverviewTab(props: { overview: StaffProfilePayload["overview"] }) {
  const { overview } = props;
  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Hours summary">
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
      <s-section heading="Earnings summary">
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
            <MetricRow label="Total Earnings" value={overview.totalEarnings} />
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

function PayrollTab(props: { payroll: StaffProfilePayload["payroll"] }) {
  const { payroll } = props;
  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Earnings summary">
        <s-box padding="small none">
          <s-stack direction="block" gap="small">
            <MetricRow label="Base Earnings" value={payroll.baseEarnings} />
            <MetricRow
              label="Salary adjustments"
              value={payroll.salaryAdjustment}
            />
            <MetricRow label="Commission" value={payroll.commission} />
            <MetricRow label="Total Earnings" value={payroll.totalEarnings} />
          </s-stack>
        </s-box>
      </s-section>
      <s-section heading="Unpaid details">
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

function ShiftsTab(props: { shifts: StaffProfilePayload["shifts"] }) {
  return (
    <s-stack direction="block" gap="large">
      <s-section heading="Upcoming shifts">
        <s-box padding="small none">
          {props.shifts.upcoming.length === 0 ? (
            <s-text>No upcoming shifts.</s-text>
          ) : (
            <s-stack direction="block" gap="base">
              {props.shifts.upcoming.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </s-stack>
          )}
        </s-box>
      </s-section>
      <s-section heading="Past shifts">
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

function strikeThroughText(value: string) {
  return [...value].map((char) => `${char}\u0336`).join("");
}

function ShiftCard(props: {
  shift: StaffProfilePayload["shifts"]["upcoming"][number];
}) {
  const { shift } = props;
  const cancelled = Boolean(shift.cancelledForLeave);
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
          <s-text type="strong" tone={cancelled ? "critical" : "auto"}>
            {cancelled ? strikeThroughText(shift.dateLabel) : shift.dateLabel}
          </s-text>
          <s-badge tone={cancelled ? "critical" : shift.tone}>
            {shift.badge}
          </s-badge>
        </s-stack>
        <s-text tone={cancelled ? "critical" : "auto"}>
          {cancelled
            ? strikeThroughText(shift.timeRangeLabel)
            : shift.timeRangeLabel}
        </s-text>
        <s-text tone={cancelled ? "critical" : "auto"}>
          📍{" "}
          {cancelled
            ? strikeThroughText(shift.locationName)
            : shift.locationName}
        </s-text>
      </s-stack>
    </s-box>
  );
}
