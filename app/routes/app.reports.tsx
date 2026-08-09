import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import {
  Briefcase,
  Calendar,
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
import { getEmployees, getPayrollEntries } from "../services/admin.server";

type ReportTab = "overview" | "daily" | "activity";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [employees, entries] = await Promise.all([
    getEmployees(session),
    getPayrollEntries(session, 30),
  ]);
  const reportEnd = new Date();

  const activeEmployees = employees.filter(
    (employee) => employee.status !== "ARCHIVED",
  );

  const summaries = entries.map((entry) => {
    const summary = summarizeTimeEntrySeconds(entry, reportEnd);
    const earnings = (summary.paidSeconds / 3600) * entry.employee.hourlyRate;
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
      totalHours: formatDurationHms(employeeTotalSeconds),
      workingHours: formatDurationHms(employeeWorkingSeconds),
      totalEarnings: formatCurrency(employeeEarnings),
      totalPaid: formatCurrency(employeeEarnings),
    };
  });

  const days = buildDateRange(30);
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
  const { metrics, staffRows, dailyRows, days, positions, activityRows } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = reportTab(searchParams.get("tab"));
  const selectedPosition = searchParams.get("position") ?? "All Positions";
  const selectedStaffId = searchParams.get("staff") ?? "";

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

  return (
    <s-page heading="Reports">
      <div className="reports-page">
        <button className="date-filter" type="button">
          <Calendar aria-hidden="true" size={16} />
          Last 30 Days
        </button>

        <nav className="report-tabs" aria-label="Report tabs">
          <ReportTabLink tab="overview" activeTab={tab}>
            Overview
          </ReportTabLink>
          <ReportTabLink tab="daily" activeTab={tab}>
            Daily Activity Report
          </ReportTabLink>
          <ReportTabLink tab="activity" activeTab={tab}>
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
    days: string[];
  }>;
  positions: string[];
  selectedPosition: string;
  onPositionChange: (value: string) => void;
}) {
  return (
    <>
      <div className="report-controls">
        <label className="select-control">
          Position
          <select
            value={selectedPosition}
            onChange={(event) => onPositionChange(event.currentTarget.value)}
          >
            <option>All Positions</option>
            {positions.map((position) => (
              <option key={position}>{position}</option>
            ))}
          </select>
        </label>
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
        <div className="day-dots" aria-hidden="true">
          <span>‹</span>
          <span className="dots">
            {Array.from({ length: 28 }).map((_, index) => (
              <i key={index} />
            ))}
          </span>
          <span>›</span>
        </div>
        <div className="table-scroll">
          <table className="report-table daily-table">
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="staff-cell">
                      <span className="avatar turquoise">{row.initials}</span>
                      {row.name}
                    </span>
                  </td>
                  <td>
                    <span className="position-pill">{row.position}</span>
                  </td>
                  {row.days.map((value, index) => (
                    <td key={`${row.id}-${days[index]?.key}`}>{value}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 2} className="empty-cell">
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
  return (
    <>
      <div className="report-controls">
        <label className="staff-select">
          <User aria-hidden="true" size={18} />
          <select
            value={selectedStaffId}
            onChange={(event) => onStaffChange(event.currentTarget.value)}
          >
            <option value="">Select Staff Member</option>
            {staffRows.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}
              </option>
            ))}
          </select>
        </label>
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
  children,
}: {
  tab: ReportTab;
  activeTab: ReportTab;
  children: ReactNode;
}) {
  const href = tab === "overview" ? "/app/reports" : `/app/reports?tab=${tab}`;
  return (
    <Link className={`report-tab${tab === activeTab ? " active" : ""}`} to={href}>
      {children}
    </Link>
  );
}

function reportTab(tab: string | null): ReportTab {
  if (tab === "daily" || tab === "activity") return tab;
  return "overview";
}

function buildDateRange(days: number) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  });
  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    result.push({
      key: toDateKey(date),
      weekday: weekdayFormatter.format(date),
      label: formatter.format(date),
    });
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

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
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
  }

  .date-filter,
  .select-control,
  .staff-select {
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

  .select-control,
  .staff-select {
    font-size: 13px;
    font-weight: 500;
  }

  .select-control select,
  .staff-select select {
    background: transparent;
    border: 0;
    color: #303030;
    font: inherit;
    outline: 0;
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
    padding: 28px 32px;
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

  .day-dots {
    align-items: center;
    color: #8a8a8a;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin: -16px 0 24px;
  }

  .dots {
    display: inline-flex;
    gap: 6px;
  }

  .dots i {
    background: #8a8a8a;
    border-radius: 999px;
    display: block;
    height: 7px;
    width: 7px;
  }

  .daily-table th:first-child,
  .daily-table td:first-child {
    position: sticky;
    left: 0;
    z-index: 1;
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
