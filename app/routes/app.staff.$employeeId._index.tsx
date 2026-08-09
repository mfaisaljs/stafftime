import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  BarChart2,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  Coins,
  DollarSign,
  Download,
  MinusCircle,
  Pencil,
  PiggyBank,
  Plus,
  Settings,
  Upload,
  UserCog,
} from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeById,
  getEmployeeTimeEntries,
} from "../services/admin.server";
import {
  calculateBreakMinutes,
  summarizeTimeEntry,
} from "../services/time-tracking.server";

type StaffTab = "overview" | "commission" | "payroll";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  if (!employeeId) throw new Response("Staff member not found", { status: 404 });

  const employee = await getEmployeeById(session, employeeId);
  if (!employee) throw new Response("Staff member not found", { status: 404 });

  const shop = await getAdminShop(session);
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  startDate.setHours(0, 0, 0, 0);

  const timeEntries = await getEmployeeTimeEntries(
    session,
    employeeId,
    startDate,
    endDate,
  );

  const settings = {
    overtimeDailyHours: shop.settings?.overtimeDailyHours ?? 8,
  };

  const summaries = timeEntries.map((entry) =>
    summarizeTimeEntry(entry, settings),
  );
  const totalWorkedMinutes = summaries.reduce(
    (sum, item) => sum + item.totalWorkedMinutes,
    0,
  );
  const paidMinutes = summaries.reduce((sum, item) => sum + item.paidMinutes, 0);
  const breakMinutes = summaries.reduce(
    (sum, item) => sum + item.paidBreakMinutes + item.unpaidBreakMinutes,
    0,
  );
  const paidEarnings = (paidMinutes / 60) * employee.hourlyRate;

  const attendanceRows = timeEntries.map((entry) => {
    const summary = summarizeTimeEntry(entry, settings);
    const end = entry.clockOutAt ?? new Date();
    const { paidBreakMinutes, unpaidBreakMinutes } = calculateBreakMinutes(
      entry.breaks,
      end,
    );
    const breakTotal = paidBreakMinutes + unpaidBreakMinutes;

    return {
      id: entry.id,
      date: entry.clockInAt.toISOString(),
      status: entry.status,
      location: entry.location.name,
      breakTime: formatDurationHms(breakTotal),
      firstIn: formatTime(entry.clockInAt),
      lastOut: entry.clockOutAt ? formatTime(entry.clockOutAt) : "—",
      totalHours: formatDurationHms(summary.totalWorkedMinutes),
    };
  });

  return {
    employee,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    metrics: {
      totalEarnings: paidEarnings,
      totalHours: formatDurationHms(totalWorkedMinutes),
      workingHours: formatDurationHms(paidMinutes),
      totalBreakTime: formatDurationHms(breakMinutes),
      totalCommission: 0,
      paid: paidEarnings,
      unpaid: 0,
      commissionPlan: "No Active Plan",
      totalAbsents: 0,
      unpaidSalary: 0,
      totalTransactions: timeEntries.length,
      totalBonus: 0,
      totalLeaves: 0,
      paidLeaves: 0,
      unpaidLeaves: 0,
    },
    attendanceRows,
  };
};

export default function StaffDetailPage() {
  const { employee, startDate, endDate, metrics, attendanceRows } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: StaffTab =
    tabParam === "commission" || tabParam === "payroll" ? tabParam : "overview";
  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <s-page>
      <s-tooltip id="inactive-staff-detail-tooltip">
        Staff automatically active when they first clock in at POS or Web Portal.
      </s-tooltip>

      <div className="staff-detail">
        <div className="detail-header">
          <div className="detail-title-row">
            <Link className="back-link" to="/app/staff" aria-label="Back to staff">
              <ArrowLeft aria-hidden="true" size={18} />
            </Link>
            <h1 className="detail-name">{fullName}</h1>
            {employee.status === "ACTIVE" ? (
              <span className="status-badge active">Active</span>
            ) : (
              <span className="status-badge inactive">
                <s-icon type="info" interestFor="inactive-staff-detail-tooltip" />
                Inactive
              </span>
            )}
          </div>
          <button className="date-range" type="button">
            <Calendar aria-hidden="true" size={16} />
            {formatDateRange(startDate, endDate)}
          </button>
        </div>

        <div className="detail-tabs">
          <TabLink tab="overview" activeTab={tab} employeeId={employee.id}>
            Overview
          </TabLink>
          <TabLink tab="commission" activeTab={tab} employeeId={employee.id}>
            Commission Program
          </TabLink>
          <TabLink tab="payroll" activeTab={tab} employeeId={employee.id}>
            Payroll
          </TabLink>
        </div>

        {tab === "overview" && (
          <OverviewTab
            employee={employee}
            metrics={metrics}
            attendanceRows={attendanceRows}
          />
        )}

        {tab === "commission" && <div className="commission-empty" />}

        {tab === "payroll" && (
          <PayrollTab metrics={metrics} transactionCount={metrics.totalTransactions} />
        )}
      </div>

      <style>{STAFF_DETAIL_STYLES}</style>
    </s-page>
  );
}

function OverviewTab({
  employee,
  metrics,
  attendanceRows,
}: {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    position: string | null;
    paymentMethod: string;
    payrollType: string;
    location: { name: string } | null;
  };
  metrics: {
    totalEarnings: number;
    totalHours: string;
    workingHours: string;
    totalBreakTime: string;
    totalCommission: number;
    paid: number;
    unpaid: number;
    commissionPlan: string;
    totalAbsents: number;
    unpaidSalary: number;
    totalTransactions: number;
    totalBonus: number;
    totalLeaves: number;
    paidLeaves: number;
    unpaidLeaves: number;
  };
  attendanceRows: Array<{
    id: string;
    date: string;
    status: string;
    location: string;
    breakTime: string;
    firstIn: string;
    lastOut: string;
    totalHours: string;
  }>;
}) {
  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <>
      <div className="overview-layout">
        <div className="metrics-grid">
          <MetricCard
            icon={<DollarSign size={18} />}
            tone="blue"
            label="Total Earnings"
            value={formatCurrency(metrics.totalEarnings)}
          />
          <MetricCard
            icon={<Clock size={18} />}
            tone="blue"
            label="Total Hours"
            value={metrics.totalHours}
          />
          <MetricCard
            icon={<Clock size={18} />}
            tone="blue"
            label="Working Hours"
            value={metrics.workingHours}
          />
          <MetricCard
            icon={<Clock size={18} />}
            tone="yellow"
            label="Total Break Time"
            value={metrics.totalBreakTime}
          />
          <MetricCard
            icon={<Coins size={18} />}
            tone="blue"
            label="Total Commission"
            value={formatCurrency(metrics.totalCommission)}
          />
          <MetricCard
            icon={<CheckCircle size={18} />}
            tone="green"
            label="Paid"
            value={formatCurrency(metrics.paid)}
          />
          <MetricCard
            icon={<AlertCircle size={18} />}
            tone="yellow"
            label="Unpaid"
            value={formatCurrency(metrics.unpaid)}
          />
          <MetricCard
            icon={<UserCog size={18} />}
            tone="blue"
            label="Commission Plan"
            value={metrics.commissionPlan}
          />
          <MetricCard
            icon={<MinusCircle size={18} />}
            tone="yellow"
            label="Total Absents"
            value={`${metrics.totalAbsents} days`}
          />
          <MetricCard
            icon={<DollarSign size={18} />}
            tone="green"
            label="Unpaid Salary"
            value={formatCurrency(metrics.unpaidSalary)}
          />
          <MetricCard
            icon={<BarChart2 size={18} />}
            tone="blue"
            label="Total Transactions"
            value={String(metrics.totalTransactions)}
          />
          <MetricCard
            icon={<PiggyBank size={18} />}
            tone="green"
            label="Total Bonus"
            value={formatCurrency(metrics.totalBonus)}
          />
          <MetricCard
            icon={<Briefcase size={18} />}
            tone="blue"
            label="Total Leaves"
            value={`${metrics.totalLeaves} days`}
          />
          <MetricCard
            icon={<CheckCircle size={18} />}
            tone="green"
            label="Paid Leaves"
            value={`${metrics.paidLeaves} days`}
          />
          <MetricCard
            icon={<CheckCircle size={18} />}
            tone="yellow"
            label="Unpaid Leaves"
            value={`${metrics.unpaidLeaves} days`}
          />
        </div>

        <aside className="staff-info-card">
          <div className="staff-info-header">
            <strong>Staff Info</strong>
            <Link
              to={`/app/staff/${employee.id}/edit`}
              aria-label="Edit staff"
              className="edit-link"
            >
              <Pencil aria-hidden="true" size={16} />
            </Link>
          </div>
          <dl className="staff-info-list">
            <InfoRow label="Name" value={fullName} />
            <InfoRow label="Email" value={employee.email ?? "—"} />
            <InfoRow label="Phone" value={employee.phone ?? "—"} />
            <InfoRow label="Position" value={employee.position ?? "Staff"} />
            <InfoRow
              label="Payment Method"
              value={paymentMethodLabel(employee.paymentMethod)}
            />
            <InfoRow
              label="Payroll Type"
              value={payrollTypeLabel(employee.payrollType)}
            />
            <InfoRow
              label="Location"
              value={employee.location?.name ?? "Shop location"}
            />
          </dl>
        </aside>
      </div>

      <section className="attendance-section">
        <div className="attendance-toolbar">
          <button className="settings-link" type="button">
            <Settings aria-hidden="true" size={16} />
            Adjust Holiday/Leave Settings
          </button>
          <div className="attendance-actions">
            <s-button variant="secondary">
              <span className="button-with-icon">
                <Upload aria-hidden="true" size={16} />
                Export
              </span>
            </s-button>
            <s-button variant="primary">
              <span className="button-with-icon">
                <Plus aria-hidden="true" size={16} />
                Add Manual Entry
              </span>
            </s-button>
          </div>
        </div>

        <div className="detail-table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Location</th>
                <th>Break Time</th>
                <th>First In</th>
                <th>Last Out</th>
                <th>Total Hours</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatTableDate(row.date)}</td>
                  <td>{formatEntryStatus(row.status)}</td>
                  <td>{row.location}</td>
                  <td>{row.breakTime}</td>
                  <td>{row.firstIn}</td>
                  <td>{row.lastOut}</td>
                  <td>{row.totalHours}</td>
                  <td>—</td>
                </tr>
              ))}
              {attendanceRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">No attendance records</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PayrollTab({
  metrics,
  transactionCount,
}: {
  metrics: {
    totalEarnings: number;
    paid: number;
    unpaid: number;
  };
  transactionCount: number;
}) {
  return (
    <>
      <div className="payroll-metrics">
        <MetricCard
          icon={<DollarSign size={18} />}
          tone="blue"
          label="Total Earnings"
          value={formatCurrency(metrics.totalEarnings, true)}
        />
        <MetricCard
          icon={<CheckCircle size={18} />}
          tone="green"
          label="Paid"
          value={formatCurrency(metrics.paid, true)}
        />
        <MetricCard
          icon={<AlertCircle size={18} />}
          tone="yellow"
          label="Unpaid"
          value={formatCurrency(metrics.unpaid)}
        />
        <MetricCard
          icon={<BarChart2 size={18} />}
          tone="blue"
          label="Total Transactions"
          value={String(transactionCount)}
        />
      </div>

      <section className="payroll-table-section">
        <div className="payroll-table-toolbar">
          <s-button variant="secondary">
            <span className="button-with-icon">
              <Download aria-hidden="true" size={16} />
              Export Transactions
            </span>
          </s-button>
        </div>

        <div className="detail-table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Details</th>
                <th>Proof</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="empty-cell">No transactions yet</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-pagination">
          <button type="button" aria-label="Previous page" disabled>‹</button>
          <button type="button" aria-label="Next page" disabled>›</button>
        </div>
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
  tone: "blue" | "green" | "yellow";
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TabLink({
  tab,
  activeTab,
  employeeId,
  children,
}: {
  tab: StaffTab;
  activeTab: StaffTab;
  employeeId: string;
  children: ReactNode;
}) {
  const href =
    tab === "overview"
      ? `/app/staff/${employeeId}`
      : `/app/staff/${employeeId}?tab=${tab}`;

  return (
    <Link
      className={`detail-tab${activeTab === tab ? " active" : ""}`}
      to={href}
    >
      {children}
    </Link>
  );
}

function formatDurationHms(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours}h ${mins}m 0s`;
}

function formatCurrency(amount: number, whole = false): string {
  if (whole && Number.isInteger(amount)) {
    return `$${amount}`;
  }
  return `$${amount.toFixed(2)}`;
}

function formatTime(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTableDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return `${fmt(startDate)} - ${fmt(endDate)}`;
}

function formatEntryStatus(status: string): string {
  const labels: Record<string, string> = {
    OPEN: "Open",
    CLOSED: "Closed",
    PENDING_APPROVAL: "Pending",
  };
  return labels[status] ?? status;
}

function paymentMethodLabel(value: string) {
  const labels: Record<string, string> = {
    PAYPAL: "PayPal",
    STRIPE: "Stripe",
    WISE: "Wise",
    PAYONEER: "Payoneer",
    BANK_TRANSFER: "Bank Transfer",
    DIRECT_DEPOSIT: "Direct Deposit",
    CASH: "Cash",
    CHECK: "Check",
    PAYSTACK: "Paystack",
    VENMO: "Venmo",
    SQUARE: "Square",
  };
  return labels[value] ?? value;
}

function payrollTypeLabel(value: string) {
  const labels: Record<string, string> = {
    HOURLY: "Hourly",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
  };
  return labels[value] ?? value;
}

const STAFF_DETAIL_STYLES = `
  .staff-detail {
    display: grid;
    gap: 16px;
  }

  .detail-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  .detail-title-row {
    align-items: center;
    display: flex;
    gap: 10px;
    min-width: 0;
  }

  .back-link {
    align-items: center;
    color: #303030;
    display: inline-flex;
    text-decoration: none;
  }

  .detail-name {
    font-size: 20px;
    font-weight: 650;
    margin: 0;
  }

  .status-badge {
    border-radius: 8px;
    display: inline-block;
    font-size: 12px;
    padding: 4px 8px;
  }

  .status-badge.active {
    background: #ddf7e3;
    color: #0b6b32;
  }

  .status-badge.inactive {
    align-items: center;
    background: #ffe8bd;
    color: #8a5700;
    display: inline-flex;
    gap: 4px;
  }

  .date-range {
    align-items: center;
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    gap: 8px;
    padding: 8px 12px;
    white-space: nowrap;
  }

  .detail-tabs {
    display: flex;
    gap: 4px;
  }

  .detail-tab {
    background: transparent;
    border-radius: 8px;
    color: #303030;
    font-size: 14px;
    padding: 8px 14px;
    text-decoration: none;
  }

  .detail-tab.active {
    background: #e9e9e9;
    font-weight: 600;
  }

  .overview-layout {
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(0, 1fr) 280px;
  }

  .metrics-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-card {
    align-items: center;
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: flex;
    gap: 12px;
    min-width: 0;
    padding: 14px 16px;
  }

  .metric-icon {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    flex-shrink: 0;
    height: 36px;
    justify-content: center;
    width: 36px;
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
    background: #fff4e5;
    color: #8a5700;
  }

  .metric-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .metric-copy span {
    color: #616161;
    font-size: 12px;
  }

  .metric-copy strong {
    color: #303030;
    font-size: 14px;
    word-break: break-word;
  }

  .staff-info-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    padding: 16px;
  }

  .staff-info-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .edit-link {
    align-items: center;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    color: #303030;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    text-decoration: none;
    width: 28px;
  }

  .staff-info-list {
    display: grid;
    gap: 10px;
    margin: 0;
  }

  .info-row {
    display: grid;
    gap: 2px;
  }

  .info-row dt {
    color: #616161;
    font-size: 12px;
  }

  .info-row dd {
    color: #303030;
    font-size: 13px;
    margin: 0;
  }

  .attendance-section,
  .payroll-table-section {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    overflow: hidden;
  }

  .attendance-toolbar,
  .payroll-table-toolbar {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px;
  }

  .settings-link {
    align-items: center;
    background: transparent;
    border: 0;
    color: #2c6ecb;
    cursor: pointer;
    display: inline-flex;
    font-size: 13px;
    gap: 6px;
    padding: 0;
  }

  .attendance-actions {
    display: flex;
    gap: 8px;
  }

  .button-with-icon {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .detail-table-wrap {
    overflow-x: auto;
  }

  .detail-table {
    border-collapse: collapse;
    min-width: 720px;
    width: 100%;
  }

  .detail-table th,
  .detail-table td {
    border-top: 1px solid #ececec;
    color: #303030;
    font-size: 13px;
    padding: 12px 20px;
    text-align: left;
  }

  .detail-table th {
    background: #fafafa;
    color: #616161;
    font-weight: 600;
  }

  .empty-cell {
    color: #616161;
    text-align: center;
  }

  .payroll-metrics {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .payroll-table-toolbar {
    justify-content: flex-end;
  }

  .table-pagination {
    display: flex;
    gap: 8px;
    justify-content: center;
    padding: 12px 20px;
  }

  .table-pagination button {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    color: #303030;
    cursor: pointer;
    min-height: 28px;
    min-width: 28px;
  }

  .table-pagination button:disabled {
    color: #b5b5b5;
    cursor: not-allowed;
  }

  .commission-empty {
    min-height: 120px;
  }

  @media (max-width: 1100px) {
    .overview-layout {
      grid-template-columns: 1fr;
    }

    .metrics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .payroll-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .detail-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .metrics-grid,
    .payroll-metrics {
      grid-template-columns: 1fr;
    }

    .attendance-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
