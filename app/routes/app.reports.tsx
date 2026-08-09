import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  Gift,
  PiggyBank,
  Receipt,
  User,
  UserCheck,
} from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getEmployees,
  getPayrollEntriesForRange,
} from "../services/admin.server";

type ReportTab = "overview" | "daily" | "activity";

const DATE_RANGE_OPTIONS = [
  { days: 1, label: "Today" },
  { days: 2, label: "Yesterday" },
  { days: 7, label: "Last 7 Days" },
  { days: 30, label: "Last 30 Days" },
  { days: 90, label: "Last 90 Days" },
  { days: 365, label: "Last 365 Days" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dateRange = resolveDateRange(url.searchParams);
  const [employees, entries] = await Promise.all([
    getEmployees(session),
    getPayrollEntriesForRange(session, dateRange.startDate, dateRange.endDate),
  ]);
  const reportEnd = new Date();

  const activeEmployees = employees.filter(
    (employee) => employee.status !== "ARCHIVED",
  );

  const summaries = entries.map((entry) => {
    const summary = summarizeTimeEntrySeconds(entry, reportEnd);
    const earnings = (summary.paidSeconds / 3600) * hourlyRateForEntry(entry);
    return { entry, summary, earnings };
  });

  const totalSeconds = summaries.reduce(
    (sum, item) => sum + item.summary.totalWorkedSeconds,
    0,
  );
  const workingSeconds = summaries.reduce(
    (sum, item) => sum + item.summary.paidSeconds,
    0,
  );
  const breakSeconds = summaries.reduce(
    (sum, item) =>
      sum + item.summary.paidBreakSeconds + item.summary.unpaidBreakSeconds,
    0,
  );
  const totalEarnings = summaries.reduce((sum, item) => sum + item.earnings, 0);

  const staffRows = activeEmployees.map((employee) => {
    const employeeSummaries = summaries.filter(
      (item) => item.entry.employeeId === employee.id,
    );
    const employeeTotalSeconds = employeeSummaries.reduce(
      (sum, item) => sum + item.summary.totalWorkedSeconds,
      0,
    );
    const employeeWorkingSeconds = employeeSummaries.reduce(
      (sum, item) => sum + item.summary.paidSeconds,
      0,
    );
    const employeeEarnings = employeeSummaries.reduce(
      (sum, item) => sum + item.earnings,
      0,
    );

    return {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      initials: initials(employee.firstName, employee.lastName),
      position: employee.position ?? "Staff",
      salary: salaryLabel(employee),
      rate: rateLabel(employee),
      totalHours: formatDurationHms(employeeTotalSeconds),
      workingHours: formatDurationHms(employeeWorkingSeconds),
      totalEarnings: formatCurrency(employeeEarnings),
      totalPaid: formatCurrency(employeeEarnings),
    };
  });

  const days = buildDateRange(dateRange.startDate, dateRange.endDate);
  const dailyRows = staffRows.map((staff) => ({
    ...staff,
    days: days.map((day) => {
      const seconds = summaries
        .filter(
          (item) =>
            item.entry.employeeId === staff.id &&
            toDateKey(item.entry.clockInAt) === day.key,
        )
        .reduce((sum, item) => sum + item.summary.totalWorkedSeconds, 0);
      return formatTimecode(seconds);
    }),
  }));

  const activityRows = summaries.map((item) => ({
    id: item.entry.id,
    staffId: item.entry.employeeId,
    staffName: `${item.entry.employee.firstName} ${item.entry.employee.lastName}`,
    action:
      item.entry.status === "OPEN"
        ? "Clocked in"
        : item.entry.status === "CLOSED"
          ? "Completed shift"
          : "Pending approval",
    details: `${item.entry.location.name} · ${formatDurationHms(
      item.summary.totalWorkedSeconds,
    )}`,
    createdAt: item.entry.clockInAt.toISOString(),
  }));

  return {
    days,
    dateRange: {
      custom: dateRange.custom,
      days: dateRange.days,
      label: dateRange.label,
      start: toDateKey(dateRange.startDate),
      end: toDateKey(dateRange.endDate),
      value: `${toDateKey(dateRange.startDate)}--${toDateKey(dateRange.endDate)}`,
      view: toMonthKey(dateRange.startDate),
    },
    positions: Array.from(new Set(staffRows.map((row) => row.position))).sort(),
    staffRows,
    dailyRows,
    activityRows,
    metrics: {
      totalStaff: activeEmployees.length,
      activeStaff: activeEmployees.filter(
        (employee) => employee.status === "ACTIVE",
      ).length,
      totalHours: formatDurationHms(totalSeconds),
      workingHours: formatDurationHms(workingSeconds),
      totalAbsents: 0,
      totalEarnings: formatCurrency(totalEarnings),
      totalBreakTime: formatDurationHms(breakSeconds),
      totalPaid: formatCurrency(totalEarnings),
      totalUnpaid: formatCurrency(0),
      totalLeaves: 0,
      totalCommission: formatCurrency(0),
      totalBonus: formatCurrency(0),
    },
  };
};

export default function ReportsPage() {
  const {
    metrics,
    staffRows,
    dailyRows,
    days,
    dateRange,
    positions,
    activityRows,
  } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateOpen, setDateOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(dateRange.value);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    dateFromKey(dateRange.start),
  );
  const tab = reportTab(searchParams.get("tab"));
  const selectedPosition = searchParams.get("position") ?? "All Positions";
  const selectedStaffId = searchParams.get("staff") ?? "";

  useEffect(() => {
    setDraftRange(dateRange.value);
    setCalendarMonth(dateFromKey(dateRange.start));
  }, [dateRange.start, dateRange.value]);

  const positionFilteredRows =
    selectedPosition === "All Positions"
      ? dailyRows
      : dailyRows.filter((row) => row.position === selectedPosition);
  const activityFilteredRows = selectedStaffId
    ? activityRows.filter((row) => row.staffId === selectedStaffId)
    : activityRows;

  const updateParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(name, value);
    } else {
      next.delete(name);
    }
    setSearchParams(next);
  };

  const applyPreset = (days: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("days", String(days));
    next.delete("start");
    next.delete("end");
    setSearchParams(next);
    setDateOpen(false);
  };

  const applyCustomRange = () => {
    const range = parsePickerRange(draftRange);
    if (!range) return;
    const next = new URLSearchParams(searchParams);
    next.set("start", range.start);
    next.set("end", range.end);
    next.delete("days");
    setSearchParams(next);
    setDateOpen(false);
  };

  const selectCalendarDay = (value: string) => {
    const range = parseDraftRange(draftRange);
    if (!range.start || range.end) {
      setDraftRange(`${value}--`);
      return;
    }

    if (value < range.start) {
      setDraftRange(`${value}--${range.start}`);
      return;
    }

    setDraftRange(`${range.start}--${value}`);
  };

  return (
    <s-page heading="Reports">
      <div className="reports-page">
        <div className="dropdown-wrap date-dropdown-wrap">
          <button
            className="date-filter"
            type="button"
            aria-haspopup="menu"
            aria-expanded={dateOpen}
            onClick={() => setDateOpen((value) => !value)}
          >
            <CalendarDays aria-hidden="true" size={16} />
            {dateRange.label}
            <ChevronDown className="chevron" aria-hidden="true" size={16} />
          </button>
          {dateOpen && (
            <div className="date-picker-panel">
              <div className="date-presets" role="menu" aria-label="Date presets">
                {DATE_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.days}
                    className={
                      !dateRange.custom && option.days === dateRange.days
                        ? "selected"
                        : ""
                    }
                    type="button"
                    role="menuitem"
                    onClick={() => applyPreset(option.days)}
                  >
                    <span>{option.label}</span>
                    {!dateRange.custom && option.days === dateRange.days && (
                      <span aria-hidden="true">✓</span>
                    )}
                  </button>
                ))}
                <button
                  className={dateRange.custom ? "selected" : ""}
                  type="button"
                  role="menuitem"
                  onClick={() => setDraftRange(dateRange.value)}
                >
                  <span>Custom</span>
                  {dateRange.custom && <span aria-hidden="true">✓</span>}
                </button>
              </div>
              <div className="date-calendar">
                <div className="date-input-row" aria-label="Selected date range">
                  <DateDisplay value={draftRange.split("--")[0] || dateRange.start} />
                  <span aria-hidden="true" className="date-arrow">
                    →
                  </span>
                  <DateDisplay value={draftRange.split("--")[1] || dateRange.end} />
                </div>
                <div className="dual-calendar" aria-label="Choose date range">
                  <CalendarMonth
                    monthDate={calendarMonth}
                    rangeValue={draftRange}
                    onDayClick={selectCalendarDay}
                    previousAction={() =>
                      setCalendarMonth(addMonths(calendarMonth, -1))
                    }
                  />
                  <CalendarMonth
                    monthDate={addMonths(calendarMonth, 1)}
                    rangeValue={draftRange}
                    onDayClick={selectCalendarDay}
                    nextAction={() =>
                      setCalendarMonth(addMonths(calendarMonth, 1))
                    }
                  />
                </div>
                <div className="date-actions">
                  <s-button type="button" onClick={() => setDateOpen(false)}>
                    Cancel
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={applyCustomRange}
                  >
                    Apply
                  </s-button>
                </div>
              </div>
            </div>
          )}
        </div>

        <nav className="report-tabs" aria-label="Report tabs">
          <ReportTabLink
            tab="overview"
            activeTab={tab}
            searchParams={searchParams}
          >
            Overview
          </ReportTabLink>
          <ReportTabLink
            tab="daily"
            activeTab={tab}
            searchParams={searchParams}
          >
            Daily Activity Report
          </ReportTabLink>
          <ReportTabLink
            tab="activity"
            activeTab={tab}
            searchParams={searchParams}
          >
            Staff Activity Log
          </ReportTabLink>
        </nav>

        {tab === "overview" && (
          <OverviewReport metrics={metrics} staffRows={staffRows} />
        )}

        {tab === "daily" && (
          <DailyActivityReport
            days={days}
            rows={positionFilteredRows}
            positions={positions}
            selectedPosition={selectedPosition}
            onPositionChange={(value) => updateParam("position", value)}
          />
        )}

        {tab === "activity" && (
          <StaffActivityLog
            rows={activityFilteredRows}
            staffRows={staffRows}
            selectedStaffId={selectedStaffId}
            onStaffChange={(value) => updateParam("staff", value)}
          />
        )}
      </div>
      <style>{REPORT_STYLES}</style>
    </s-page>
  );
}

function OverviewReport({
  metrics,
  staffRows,
}: {
  metrics: {
    totalStaff: number;
    activeStaff: number;
    totalHours: string;
    workingHours: string;
    totalAbsents: number;
    totalEarnings: string;
    totalBreakTime: string;
    totalPaid: string;
    totalUnpaid: string;
    totalLeaves: number;
    totalCommission: string;
    totalBonus: string;
  };
  staffRows: Array<{
    id: string;
    initials: string;
    name: string;
    position: string;
    salary: string;
    rate: string;
    totalHours: string;
    workingHours: string;
    totalEarnings: string;
    totalPaid: string;
  }>;
}) {
  return (
    <>
      <div className="report-metrics">
        <MetricCard
          icon={<User size={18} />}
          tone="blue"
          label="Total Staff"
          value={String(metrics.totalStaff)}
        />
        <MetricCard
          icon={<UserCheck size={18} />}
          tone="green"
          label="Active Staff"
          value={String(metrics.activeStaff)}
        />
        <MetricCard
          icon={<Clock size={18} />}
          tone="yellow"
          label="Total Hours"
          value={metrics.totalHours}
        />
        <MetricCard
          icon={<Clock size={18} />}
          tone="yellow"
          label="Working Hours"
          value={metrics.workingHours}
        />
        <MetricCard
          icon={<Clock size={18} />}
          tone="yellow"
          label="Total Absents"
          value={String(metrics.totalAbsents)}
        />
        <MetricCard
          icon={<Briefcase size={18} />}
          tone="green"
          label="Total Earnings"
          value={metrics.totalEarnings}
        />
        <MetricCard
          icon={<Clock size={18} />}
          tone="yellow"
          label="Total Break Time"
          value={metrics.totalBreakTime}
        />
        <MetricCard
          icon={<DollarSign size={18} />}
          tone="green"
          label="Total Paid"
          value={metrics.totalPaid}
        />
        <MetricCard
          icon={<DollarSign size={18} />}
          tone="yellow"
          label="Total Unpaid"
          value={metrics.totalUnpaid}
        />
        <MetricCard
          icon={<Receipt size={18} />}
          tone="purple"
          label="Total Leaves"
          value={String(metrics.totalLeaves)}
        />
        <MetricCard
          icon={<Receipt size={18} />}
          tone="purple"
          label="Total Commission"
          value={metrics.totalCommission}
        />
        <MetricCard
          icon={<Gift size={18} />}
          tone="purple"
          label="Total Bonus"
          value={metrics.totalBonus}
        />
      </div>

      <section className="report-card table-card">
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Salary</th>
                <th>Total Hours</th>
                <th>Working Hours</th>
                <th>Total Earnings</th>
                <th>Total Paid</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="staff-cell">
                      <span className="avatar">{row.initials}</span>
                      {row.name}
                    </span>
                  </td>
                  <td>{row.position}</td>
                  <td>{row.salary}</td>
                  <td>{row.totalHours}</td>
                  <td>{row.workingHours}</td>
                  <td>{row.totalEarnings}</td>
                  <td>{row.totalPaid}</td>
                </tr>
              ))}
              {staffRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No staff records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="knowledge-link">
        For more guidance, visit our <a href="/app">Knowledge Base</a>
      </p>
    </>
  );
}

function DailyActivityReport({
  days,
  rows,
  positions,
  selectedPosition,
  onPositionChange,
}: {
  days: Array<{ key: string; weekday: string; label: string }>;
  rows: Array<{
    id: string;
    initials: string;
    name: string;
    position: string;
    rate: string;
    totalHours: string;
    workingHours: string;
    days: string[];
  }>;
  positions: string[];
  selectedPosition: string;
  onPositionChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const positionOptions = ["All Positions", ...positions];

  return (
    <>
      <div className="report-controls">
        <div className="dropdown-wrap">
          <button
            className="filter-dropdown position-dropdown"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span>Position</span>
            <strong>{selectedPosition}</strong>
            <ChevronDown className="chevron" aria-hidden="true" size={16} />
          </button>
          {open && (
            <div className="dropdown-menu position-menu" role="menu">
              {positionOptions.map((position) => (
                <button
                  key={position}
                  className={position === selectedPosition ? "selected" : ""}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onPositionChange(position);
                    setOpen(false);
                  }}
                >
                  {position}
                </button>
              ))}
            </div>
          )}
        </div>
        <s-button variant="secondary">
          <span className="button-with-icon">
            <Download aria-hidden="true" size={16} />
            Export
          </span>
        </s-button>
      </div>

      <section className="report-card daily-card">
        <div className="card-header">
          <h2>Daily Activity Report</h2>
          <span>
            {selectedPosition === "All Positions"
              ? "Showing all positions"
              : `Showing ${selectedPosition}`}
          </span>
        </div>
        <div className="table-scroll">
          <table
            className="report-table daily-table"
            style={{ minWidth: `${Math.max(980, 640 + days.length * 88)}px` }}
          >
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Position</th>
                {days.map((day) => (
                  <th key={day.key}>
                    <span>{day.weekday}</span>
                    <small>{day.label}</small>
                  </th>
                ))}
                <th>Total Hours</th>
                <th>Working Hours <span className="info-dot">?</span></th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="staff-cell">
                      <span className="avatar turquoise">{row.initials}</span>
                      <span className="staff-name">{row.name}</span>
                    </span>
                  </td>
                  <td>
                    <span className="position-pill">{row.position}</span>
                  </td>
                  {row.days.map((value, index) => (
                    <td key={`${row.id}-${days[index]?.key}`}>{value}</td>
                  ))}
                  <td className="strong-cell">{row.totalHours}</td>
                  <td className="strong-cell">{row.workingHours}</td>
                  <td>{row.rate}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 5} className="empty-cell">
                    No daily activity found for this position.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="table-footnote">Showing staff members {rows.length}</p>
      </section>
    </>
  );
}

function StaffActivityLog({
  rows,
  staffRows,
  selectedStaffId,
  onStaffChange,
}: {
  rows: Array<{
    id: string;
    staffName: string;
    action: string;
    details: string;
    createdAt: string;
  }>;
  staffRows: Array<{ id: string; initials: string; name: string }>;
  selectedStaffId: string;
  onStaffChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedStaff = staffRows.find((staff) => staff.id === selectedStaffId);

  return (
    <>
      <div className="report-controls">
        <div className="dropdown-wrap">
          <button
            className="filter-dropdown staff-dropdown"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="dropdown-icon">
              <User aria-hidden="true" size={18} />
            </span>
            <strong>{selectedStaff?.name ?? "Select Staff Member"}</strong>
            <ChevronDown className="chevron" aria-hidden="true" size={16} />
          </button>
          {open && (
            <div className="dropdown-menu staff-menu" role="menu">
              <button
                className={!selectedStaffId ? "selected" : ""}
                type="button"
                role="menuitem"
                onClick={() => {
                  onStaffChange("");
                  setOpen(false);
                }}
              >
                <span className="dropdown-icon">
                  <User aria-hidden="true" size={18} />
                </span>
                <strong>Select Staff Member</strong>
              </button>
              {staffRows.map((staff) => (
                <button
                  key={staff.id}
                  className={staff.id === selectedStaffId ? "selected" : ""}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onStaffChange(staff.id);
                    setOpen(false);
                  }}
                >
                  <span className="avatar turquoise">{staff.initials}</span>
                  <strong>{staff.name}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
        <s-button variant="secondary">
          <span className="button-with-icon">
            <Download aria-hidden="true" size={16} />
            Export
          </span>
        </s-button>
      </div>

      <section className="report-card activity-card">
        <div className="card-header">
          <h2>Staff Activity Log</h2>
          <span>
            {selectedStaffId ? "Showing selected staff activity" : "Showing all staff activity"}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="activity-empty">
            <strong>No activity records found</strong>
            <span>No staff activity records found for the selected date range</span>
          </div>
        ) : (
          <div className="activity-list">
            {rows.map((row) => (
              <div className="activity-row" key={row.id}>
                <strong>{row.staffName}</strong>
                <span>{row.action}</span>
                <span>{row.details}</span>
                <time>{formatDateTime(row.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: ReactNode;
  tone: "blue" | "green" | "yellow" | "purple";
  label: string;
  value: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ReportTabLink({
  tab,
  activeTab,
  searchParams,
  children,
}: {
  tab: ReportTab;
  activeTab: ReportTab;
  searchParams: URLSearchParams;
  children: ReactNode;
}) {
  const next = new URLSearchParams(searchParams);
  if (tab === "overview") {
    next.delete("tab");
  } else {
    next.set("tab", tab);
  }
  const query = next.toString();
  const href = query ? `/app/reports?${query}` : "/app/reports";
  return (
    <Link className={`report-tab${tab === activeTab ? " active" : ""}`} to={href}>
      {children}
    </Link>
  );
}

function DateDisplay({ value }: { value: string }) {
  return (
    <div className="date-display">
      <CalendarDays aria-hidden="true" size={18} />
      <span>{formatNumericDate(value)}</span>
    </div>
  );
}

function CalendarMonth({
  monthDate,
  rangeValue,
  onDayClick,
  previousAction,
  nextAction,
}: {
  monthDate: Date;
  rangeValue: string;
  onDayClick: (value: string) => void;
  previousAction?: () => void;
  nextAction?: () => void;
}) {
  const range = parseDraftRange(rangeValue);
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const days = monthGrid(monthDate);

  return (
    <div className="calendar-month">
      <div className="calendar-heading">
        {previousAction ? (
          <button
            className="month-nav"
            type="button"
            aria-label="Previous month"
            onClick={previousAction}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <strong>{monthLabel(monthDate)}</strong>
        {nextAction ? (
          <button
            className="month-nav"
            type="button"
            aria-label="Next month"
            onClick={nextAction}
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-days">
        {days.map((day, index) =>
          day ? (
            <button
              key={toDateKey(day)}
              className={calendarDayClass(toDateKey(day), range)}
              type="button"
              onClick={() => onDayClick(toDateKey(day))}
            >
              {day.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}

function reportTab(tab: string | null): ReportTab {
  if (tab === "daily" || tab === "activity") return tab;
  return "overview";
}

function resolveDateRange(searchParams: URLSearchParams) {
  const customRange = parseCustomRange(
    searchParams.get("start"),
    searchParams.get("end"),
  );
  if (customRange) {
    return {
      ...customRange,
      custom: true,
      days: 0,
      label: `${formatNumericDate(toDateKey(customRange.startDate))} - ${formatNumericDate(
        toDateKey(customRange.endDate),
      )}`,
    };
  }

  const days = normalizeRangeDays(searchParams.get("days"));
  const today = startOfDay(new Date());
  const endDate = endOfDay(today);
  const startDate = new Date(today);

  if (days === 2) {
    startDate.setDate(today.getDate() - 1);
    return {
      custom: false,
      days,
      label: "Yesterday",
      startDate,
      endDate: endOfDay(startDate),
    };
  }

  startDate.setDate(today.getDate() - (days - 1));
  return {
    custom: false,
    days,
    label: rangeLabel(days),
    startDate,
    endDate,
  };
}

function normalizeRangeDays(value: string | null) {
  const parsed = Number(value);
  return DATE_RANGE_OPTIONS.some((option) => option.days === parsed)
    ? parsed
    : 30;
}

function rangeLabel(days: number) {
  return (
    DATE_RANGE_OPTIONS.find((option) => option.days === days)?.label ??
    "Last 30 Days"
  );
}

function parseCustomRange(start: string | null, end: string | null) {
  if (!isDateKey(start) || !isDateKey(end)) return null;
  const startDate = startOfDay(dateFromKey(start));
  const endDate = endOfDay(dateFromKey(end));
  if (startDate.getTime() > endDate.getTime()) return null;
  return { startDate, endDate };
}

function parsePickerRange(value: string) {
  const [start, end] = value.split("--");
  if (!isDateKey(start) || !isDateKey(end)) return null;
  return { start, end };
}

function parseDraftRange(value: string) {
  const [start, end] = value.split("--");
  return {
    start: isDateKey(start) ? start : "",
    end: isDateKey(end) ? end : "",
  };
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function monthGrid(value: Date) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  const days: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(value.getFullYear(), value.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function calendarDayClass(
  key: string,
  range: ReturnType<typeof parseDraftRange>,
) {
  const classes = ["calendar-day"];
  const todayKey = toDateKey(new Date());
  const hasCompleteRange = Boolean(range.start && range.end);

  if (key === todayKey) classes.push("today");
  if (key === range.start) classes.push("range-start");
  if (key === range.end) classes.push("range-end");
  if (range.start && !range.end && key === range.start) {
    classes.push("range-pending");
  }
  if (hasCompleteRange && key > range.start && key < range.end) {
    classes.push("range-middle");
  }

  return classes.join(" ");
}

function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function buildDateRange(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  });
  const result = [];
  const current = startOfDay(startDate);
  const last = startOfDay(endDate);

  while (current.getTime() <= last.getTime()) {
    const date = new Date(current);
    result.push({
      key: toDateKey(date),
      weekday: weekdayFormatter.format(date),
      label: formatter.format(date),
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "ST";
}

function salaryLabel(employee: {
  currency: string;
  hourlyRate: number;
  payrollType: string;
  salaryAmount: number;
}) {
  const amount =
    employee.payrollType === "HOURLY"
      ? employee.hourlyRate
      : employee.salaryAmount;
  return `${employee.currency} ${amount.toFixed(2)}`;
}

function rateLabel(employee: {
  currency: string;
  hourlyRate: number;
  payrollType: string;
  salaryAmount: number;
}) {
  if (employee.payrollType === "HOURLY") {
    return `${employee.currency}${formatCompactAmount(employee.hourlyRate)}/hr`;
  }

  const period = employee.payrollType === "WEEKLY" ? "wk" : "mo";
  return `${employee.currency}${formatCompactAmount(employee.salaryAmount)}/${period}`;
}

function hourlyRateForEntry(entry: {
  hourlyRateSnapshot: number | null;
  employee: { hourlyRate: number };
}) {
  return entry.hourlyRateSnapshot ?? entry.employee.hourlyRate;
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatNumericDate(value: string) {
  if (!isDateKey(value)) return value;
  const [year, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function summarizeTimeEntrySeconds(
  entry: {
    clockInAt: Date;
    clockOutAt: Date | null;
    breaks: Array<{ type: string; startedAt: Date; endedAt: Date | null }>;
  },
  referenceDate: Date,
) {
  const end = entry.clockOutAt ?? referenceDate;
  const totalWorkedSeconds = secondsBetween(entry.clockInAt, end);
  const breakTotals = entry.breaks.reduce(
    (totals, breakEntry) => {
      const breakEnd = breakEntry.endedAt ?? end;
      const seconds = secondsBetween(breakEntry.startedAt, breakEnd);
      if (breakEntry.type === "PAID") {
        totals.paidBreakSeconds += seconds;
      } else {
        totals.unpaidBreakSeconds += seconds;
      }
      return totals;
    },
    { paidBreakSeconds: 0, unpaidBreakSeconds: 0 },
  );

  return {
    totalWorkedSeconds,
    paidBreakSeconds: breakTotals.paidBreakSeconds,
    unpaidBreakSeconds: breakTotals.unpaidBreakSeconds,
    paidSeconds: Math.max(0, totalWorkedSeconds - breakTotals.unpaidBreakSeconds),
  };
}

function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function formatDurationHms(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${mins}m ${seconds}s`;
}

function formatTimecode(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function formatCompactAmount(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const REPORT_STYLES = `
  .reports-page {
    display: grid;
    gap: 18px;
    min-width: 0;
  }

  .date-filter,
  .filter-dropdown {
    align-items: center;
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 8px;
    color: #303030;
    display: inline-flex;
    gap: 8px;
    justify-self: start;
    min-height: 36px;
    padding: 0 12px;
  }

  .date-filter {
    cursor: pointer;
    font-weight: 600;
    min-width: 170px;
  }

  .date-filter svg {
    color: #303030;
    display: block;
    flex-shrink: 0;
  }

  .date-dropdown-wrap {
    width: max-content;
  }

  .date-picker-panel {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
    display: grid;
    grid-template-columns: 170px minmax(360px, 1fr);
    left: 0;
    overflow: hidden;
    padding: 10px;
    position: absolute;
    top: calc(100% + 8px);
    width: min(810px, calc(100vw - 48px));
    z-index: 30;
  }

  .date-presets {
    display: grid;
    align-content: start;
    gap: 4px;
    padding: 2px 10px 2px 0;
  }

  .date-presets button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    min-height: 40px;
    padding: 8px 10px;
    text-align: left;
  }

  .date-presets button:hover,
  .date-presets button.selected {
    background: #e9e9e9;
    font-weight: 650;
  }

  .date-calendar {
    border-left: 1px solid #ebebeb;
    display: grid;
    gap: 14px;
    min-width: 0;
    padding-left: 16px;
  }

  .date-input-row {
    align-items: center;
    display: grid;
    gap: 14px;
    grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr);
  }

  .date-display {
    align-items: center;
    border: 1px solid #aeb4b9;
    border-radius: 8px;
    color: #303030;
    display: flex;
    gap: 10px;
    min-height: 40px;
    padding: 0 12px;
  }

  .date-display svg {
    color: #616161;
  }

  .date-arrow {
    color: #303030;
    font-size: 26px;
    line-height: 1;
  }

  .dual-calendar {
    display: grid;
    gap: 22px;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }

  .calendar-month {
    display: grid;
    gap: 12px;
  }

  .calendar-heading {
    align-items: center;
    color: #303030;
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    text-align: center;
  }

  .month-nav {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #8a8a8a;
    cursor: pointer;
    display: inline-flex;
    height: 32px;
    justify-content: center;
    width: 32px;
  }

  .month-nav:hover {
    background: #f1f1f1;
    color: #303030;
  }

  .calendar-weekdays,
  .calendar-days {
    display: grid;
    grid-template-columns: repeat(7, minmax(28px, 1fr));
  }

  .calendar-weekdays span {
    color: #616161;
    font-size: 13px;
    font-weight: 650;
    padding: 4px 0;
    text-align: center;
  }

  .calendar-days {
    row-gap: 2px;
  }

  .calendar-day {
    background: transparent;
    border: 0;
    color: #303030;
    cursor: pointer;
    font: inherit;
    min-height: 40px;
    position: relative;
    z-index: 0;
  }

  .calendar-day:hover {
    background: #f1f1f1;
  }

  .calendar-day.range-middle {
    background: #f1f1f1;
  }

  .calendar-day.range-start,
  .calendar-day.range-end {
    background: #303030;
    color: #fff;
    font-weight: 700;
  }

  .calendar-day.range-start {
    border-radius: 8px 0 0 8px;
  }

  .calendar-day.range-end {
    border-radius: 0 8px 8px 0;
  }

  .calendar-day.range-start.range-end {
    border-radius: 8px;
  }

  .calendar-day.range-pending {
    border-radius: 8px;
  }

  .calendar-day.today:not(.range-start):not(.range-end) {
    box-shadow: inset 0 0 0 1px #303030;
    border-radius: 8px;
  }

  .date-actions {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  @media (max-width: 760px) {
    .date-picker-panel {
      grid-template-columns: 1fr;
      width: min(520px, calc(100vw - 32px));
    }

    .date-calendar {
      border-left: 0;
      border-top: 1px solid #ebebeb;
      padding-left: 0;
      padding-top: 14px;
    }

    .dual-calendar {
      grid-template-columns: 1fr;
    }
  }

  .report-tabs {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  .report-tab {
    border-radius: 8px;
    color: #303030;
    padding: 8px 14px;
    text-decoration: none;
  }

  .report-tab.active {
    background: #e3e3e3;
    font-weight: 650;
  }

  .report-metrics {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-card,
  .report-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    min-width: 0;
  }

  .metric-card {
    align-items: center;
    display: flex;
    min-height: 82px;
    padding: 16px 20px;
    position: relative;
  }

  .metric-icon {
    align-items: center;
    border-radius: 6px;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    position: absolute;
    right: 18px;
    top: 18px;
    width: 28px;
  }

  .metric-icon.blue {
    background: #e8f1ff;
    color: #2c6ecb;
  }

  .metric-icon.green {
    background: #e3f8e8;
    color: #0b6b32;
  }

  .metric-icon.yellow {
    background: #fff4d6;
    color: #8a5700;
  }

  .metric-icon.purple {
    background: #f1e9ff;
    color: #5c3ebf;
  }

  .metric-copy {
    display: grid;
    gap: 8px;
  }

  .metric-copy span {
    color: #616161;
    font-size: 12px;
  }

  .metric-copy strong {
    color: #303030;
    font-size: 20px;
  }

  .report-controls {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .dropdown-wrap {
    justify-self: start;
    position: relative;
  }

  .filter-dropdown {
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }

  .filter-dropdown strong {
    font-weight: 650;
  }

  .position-dropdown {
    min-width: 210px;
  }

  .staff-dropdown {
    min-width: 250px;
  }

  .dropdown-icon {
    align-items: center;
    background: #e8f6ff;
    border-radius: 6px;
    color: #007ace;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .chevron {
    color: #616161;
    margin-left: auto;
  }

  .dropdown-menu {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    display: grid;
    left: 0;
    min-width: 100%;
    overflow: hidden;
    padding: 8px;
    position: absolute;
    top: calc(100% + 6px);
    z-index: 20;
  }

  .dropdown-menu button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: flex;
    gap: 10px;
    min-height: 40px;
    padding: 8px 10px;
    text-align: left;
    white-space: nowrap;
  }

  .dropdown-menu button:hover,
  .dropdown-menu button.selected {
    background: #f1f1f1;
  }

  .staff-menu {
    min-width: 250px;
  }

  .position-menu {
    min-width: 210px;
  }

  .button-with-icon {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .table-card {
    overflow: hidden;
  }

  .table-scroll {
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
  }

  .report-table {
    border-collapse: collapse;
    min-width: 920px;
    width: 100%;
  }

  .report-table th,
  .report-table td {
    border-top: 1px solid #e3e3e3;
    color: #303030;
    font-size: 13px;
    padding: 12px 16px;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }

  .report-table th {
    background: #fafafa;
    color: #616161;
    font-weight: 650;
  }

  .staff-cell {
    align-items: center;
    display: inline-flex;
    gap: 8px;
    font-weight: 650;
    max-width: 100%;
    min-width: 0;
  }

  .staff-name {
    display: inline-block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .avatar {
    align-items: center;
    background: #f1f1f1;
    border-radius: 6px;
    color: #303030;
    display: inline-flex;
    font-size: 11px;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .avatar.turquoise {
    background: #39d8d2;
  }

  .knowledge-link,
  .table-footnote {
    color: #616161;
    font-size: 12px;
    margin: 0;
    text-align: center;
  }

  .knowledge-link a {
    color: #2c6ecb;
  }

  .daily-card,
  .activity-card {
    min-width: 0;
    overflow: hidden;
    padding: 28px 32px;
  }

  .daily-card .table-scroll {
    padding-bottom: 12px;
  }

  .daily-table {
    table-layout: fixed;
    width: 100%;
  }

  .card-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 28px;
  }

  .card-header h2 {
    font-size: 18px;
    margin: 0;
  }

  .card-header span {
    color: #616161;
    font-size: 13px;
  }

  .daily-table th:first-child,
  .daily-table td:first-child {
    box-shadow: 8px 0 12px rgba(255, 255, 255, 0.92);
    max-width: 220px;
    min-width: 220px;
    position: sticky;
    left: 0;
    width: 220px;
    z-index: 1;
  }

  .daily-table th:nth-child(2),
  .daily-table td:nth-child(2) {
    max-width: 120px;
    min-width: 120px;
    width: 120px;
  }

  .daily-table th:first-child {
    background: #fafafa;
  }

  .daily-table td:first-child {
    background: #fff;
  }

  .daily-table th small {
    color: #8a8a8a;
    display: block;
    font-weight: 500;
    margin-top: 4px;
  }

  .daily-table th:not(:first-child):not(:nth-child(2)),
  .daily-table td:not(:first-child):not(:nth-child(2)) {
    text-align: center;
  }

  .strong-cell {
    font-weight: 700;
  }

  .info-dot {
    align-items: center;
    background: #ebebeb;
    border-radius: 999px;
    color: #616161;
    display: inline-flex;
    font-size: 10px;
    height: 14px;
    justify-content: center;
    margin-left: 4px;
    width: 14px;
  }

  .position-pill {
    background: #fff064;
    border-radius: 999px;
    color: #303030;
    display: inline-flex;
    font-size: 12px;
    padding: 4px 10px;
  }

  .activity-empty {
    background: #f7f7f7;
    border-radius: 10px;
    color: #616161;
    display: grid;
    gap: 12px;
    margin: 0 24px 24px;
    padding: 28px 32px;
  }

  .activity-empty strong {
    color: #303030;
  }

  .activity-list {
    display: grid;
    gap: 8px;
  }

  .activity-row {
    align-items: center;
    background: #f7f7f7;
    border-radius: 8px;
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr 1fr 2fr auto;
    padding: 14px 16px;
  }

  .empty-cell {
    color: #616161;
    padding: 32px;
    text-align: center;
  }

  @media (max-width: 900px) {
    .report-metrics {
      grid-template-columns: 1fr;
    }

    .report-controls,
    .card-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
