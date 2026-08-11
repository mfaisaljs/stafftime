import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  BadgePercent,
  BarChart2,
  Briefcase,
  CheckCircle,
  Clock,
  Coins,
  DollarSign,
  Download,
  FileText,
  MinusCircle,
  Pencil,
  PiggyBank,
  Plus,
  Settings,
  Upload,
  UserCog,
} from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeById,
  getEmployeeTimeEntries,
} from "../services/admin.server";
import {
  formatClockTime,
  formatDurationHms,
  summarizeTimeEntrySeconds,
  type HourFormat,
  type TimeFormat,
} from "../services/time-tracking.server";
import {
  clampRangeStartForSalary,
  computeSalaryAdjustments,
  countAbsentDays,
  countLeaveDays,
  enumerateDateKeys,
  getApprovedTimeOffForRange,
  getShopSettings,
} from "../services/settings.server";
import {
  DateRangeSelector,
  defaultDateRangeValue,
  rangeFromPreset,
  type DateRangeValue,
} from "../components/DateRangeSelector";
import {
  filterRequestsForEmployee,
  SHIFT_STATUS,
} from "../services/time-off-shifts.server";

type StaffTab = "overview" | "commission" | "payroll";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  if (!employeeId) throw new Response("Staff member not found", { status: 404 });

  const employee = await getEmployeeById(session, employeeId);
  if (!employee) throw new Response("Staff member not found", { status: 404 });

  const shop = await getAdminShop(session);
  const settings = await getShopSettings(shop.id);
  const url = new URL(request.url);
  const dateRange = resolveDateRange(url.searchParams);
  let startDate = startOfDayFromKey(dateRange.start);
  const endDate = endOfDayFromKey(dateRange.end);
  startDate = await clampRangeStartForSalary(
    shop.id,
    employeeId,
    startDate,
    settings,
  );

  const [timeEntries, shifts, timeOffRequests] = await Promise.all([
    getEmployeeTimeEntries(session, employeeId, startDate, endDate),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        employeeId,
        status: {
          in: [SHIFT_STATUS.SCHEDULED, SHIFT_STATUS.CANCELLED_LEAVE],
        },
        startsAt: { gte: startDate, lte: endDate },
      },
    }),
    getApprovedTimeOffForRange(shop.id, dateRange.start, dateRange.end),
  ]);

  const reportEnd = new Date();
  const summarizeOptions = { deductBreakTime: settings.deductBreakTime };
  const summaries = timeEntries.map((entry) =>
    summarizeTimeEntrySeconds(entry, reportEnd, summarizeOptions),
  );
  const totalWorkedSeconds = summaries.reduce(
    (sum, item) => sum + item.totalWorkedSeconds,
    0,
  );
  const paidSeconds = summaries.reduce((sum, item) => sum + item.paidSeconds, 0);
  const breakSeconds = summaries.reduce(
    (sum, item) => sum + item.paidBreakSeconds + item.unpaidBreakSeconds,
    0,
  );
  const baseEarnings = timeEntries.reduce((sum, entry, index) => {
    const hourlyRate = entry.hourlyRateSnapshot ?? employee.hourlyRate;
    return sum + (summaries[index].paidSeconds / 3600) * hourlyRate;
  }, 0);

  const dateKeys = enumerateDateKeys(dateRange.start, dateRange.end);
  const shiftsByDate = new Map<string, boolean>();
  for (const shift of shifts) {
    shiftsByDate.set(toDateKeyLocal(shift.startsAt), true);
  }
  const clockedDates = new Set(
    timeEntries.map((entry) => toDateKeyLocal(entry.clockInAt)),
  );
  const employeeTimeOff = filterRequestsForEmployee(timeOffRequests, employeeId);
  const totalAbsents = countAbsentDays(
    dateKeys,
    shiftsByDate,
    clockedDates,
    employeeTimeOff,
    settings,
  );
  const paidLeaves = countLeaveDays(dateKeys, employeeTimeOff, "PAID");
  const unpaidLeaves = countLeaveDays(dateKeys, employeeTimeOff, "UNPAID");
  const salaryAdjustment = computeSalaryAdjustments({
    employee,
    dateKeys,
    shiftsByDate,
    clockedDates,
    requests: employeeTimeOff,
    settings,
  });
  const paidEarnings = baseEarnings + salaryAdjustment;
  const hourFormat = settings.hourFormat as HourFormat;
  const timeFormat = settings.timeFormat as TimeFormat;

  const commissionPrograms = await prisma.commissionProgram.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, employeeIds: true, active: true },
  });
  const assignedPrograms = commissionPrograms
    .filter((program) => {
      try {
        const ids = JSON.parse(program.employeeIds) as unknown;
        return Array.isArray(ids) && ids.includes(employeeId);
      } catch {
        return false;
      }
    })
    .map((program) => ({
      id: program.id,
      name: program.name,
      active: program.active,
    }));

  // Commission order earnings are not persisted yet — show zeroed totals/empty list.
  const commissionEarnings = {
    total: 0,
    paid: 0,
    unpaid: 0,
    orders: [] as Array<{
      id: string;
      programId: string;
      programName: string;
      status: "paid" | "unpaid";
      amount: number;
      createdAt: string;
    }>,
  };

  const attendanceRows = timeEntries.map((entry, index) => {
    const summary = summaries[index];
    const breakTotal = summary.paidBreakSeconds + summary.unpaidBreakSeconds;

    return {
      id: entry.id,
      date: entry.clockInAt.toISOString(),
      status: entry.status,
      location: entry.location.name,
      breakTime: formatDurationHms(breakTotal, hourFormat),
      firstIn: formatClockTime(entry.clockInAt, timeFormat),
      lastOut: entry.clockOutAt ? formatClockTime(entry.clockOutAt, timeFormat) : "—",
      totalHours: formatDurationHms(summary.totalWorkedSeconds, hourFormat),
    };
  });

  const activeAssigned = assignedPrograms.filter((program) => program.active);

  return {
    employee,
    dateRange,
    metrics: {
      totalEarnings: paidEarnings,
      totalHours: formatDurationHms(totalWorkedSeconds, hourFormat),
      workingHours: formatDurationHms(paidSeconds, hourFormat),
      totalBreakTime: formatDurationHms(breakSeconds, hourFormat),
      totalCommission: commissionEarnings.total,
      paid: paidEarnings,
      unpaid: 0,
      commissionPlan:
        activeAssigned.length === 0
          ? "No Active Plan"
          : activeAssigned.length === 1
            ? activeAssigned[0].name
            : `${activeAssigned.length} Active Plans`,
      totalAbsents,
      unpaidSalary: 0,
      totalTransactions: timeEntries.length,
      totalBonus: 0,
      totalLeaves: paidLeaves + unpaidLeaves,
      paidLeaves,
      unpaidLeaves,
    },
    commission: {
      ...commissionEarnings,
      programs: assignedPrograms,
    },
    attendanceRows,
  };
};

export default function StaffDetailPage() {
  const { employee, dateRange, metrics, commission, attendanceRows } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: StaffTab =
    tabParam === "commission" || tabParam === "payroll" ? tabParam : "overview";
  const fullName = `${employee.firstName} ${employee.lastName}`;

  const applyRange = (next: DateRangeValue) => {
    const params = new URLSearchParams(searchParams);
    if (next.custom) {
      params.set("start", next.start);
      params.set("end", next.end);
      params.delete("days");
    } else {
      params.set("days", String(next.days));
      params.delete("start");
      params.delete("end");
    }
    setSearchParams(params);
  };

  return (
    <s-page inlineSize="large">
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
          <div className="date-control">
            <DateRangeSelector
              value={dateRange}
              onChange={applyRange}
              align="end"
              includeHiddenInputs={false}
            />
          </div>
        </div>

        <div className="detail-tabs">
          <TabLink
            tab="overview"
            activeTab={tab}
            employeeId={employee.id}
            searchParams={searchParams}
          >
            Overview
          </TabLink>
          <TabLink
            tab="commission"
            activeTab={tab}
            employeeId={employee.id}
            searchParams={searchParams}
          >
            Commission Program
          </TabLink>
          <TabLink
            tab="payroll"
            activeTab={tab}
            employeeId={employee.id}
            searchParams={searchParams}
          >
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

        {tab === "commission" && <CommissionTab commission={commission} />}

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

function CommissionTab({
  commission,
}: {
  commission: {
    total: number;
    paid: number;
    unpaid: number;
    programs: Array<{ id: string; name: string; active: boolean }>;
    orders: Array<{
      id: string;
      programId: string;
      programName: string;
      status: "paid" | "unpaid";
      amount: number;
      createdAt: string;
    }>;
  };
}) {
  const [programFilter, setProgramFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortFilter, setSortFilter] = useState("recent");

  const filteredOrders = useMemo(() => {
    let orders = [...commission.orders];
    if (programFilter !== "all") {
      orders = orders.filter((order) => order.programId === programFilter);
    }
    if (statusFilter !== "all") {
      orders = orders.filter((order) => order.status === statusFilter);
    }
    orders.sort((a, b) => {
      if (sortFilter === "amount-high") return b.amount - a.amount;
      if (sortFilter === "amount-low") return a.amount - b.amount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return orders;
  }, [commission.orders, programFilter, statusFilter, sortFilter]);

  return (
    <div className="commission-tab">
      <div className="commission-metrics">
        <MetricCard
          icon={<BadgePercent size={20} />}
          tone="blue"
          label="Total Commission"
          value={formatCurrency(commission.total)}
        />
        <MetricCard
          icon={<CheckCircle size={20} />}
          tone="green"
          label="Paid Commission"
          value={formatCurrency(commission.paid)}
        />
        <MetricCard
          icon={<AlertCircle size={20} />}
          tone="yellow"
          label="Unpaid Commission"
          value={formatCurrency(commission.unpaid)}
        />
      </div>

      <section className="commission-orders-card">
        <div className="commission-orders-header">
          <Briefcase aria-hidden="true" size={18} />
          <strong>Commission Orders</strong>
        </div>

        <div className="commission-filters">
          <label>
            <span className="visually-hidden">Commission Programs</span>
            <select
              value={programFilter}
              onChange={(event) => setProgramFilter(event.currentTarget.value)}
            >
              <option value="all">All Programs</option>
              {commission.programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="visually-hidden">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value)}
            >
              <option value="all">All Orders</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <label>
            <span className="visually-hidden">Sort</span>
            <select
              value={sortFilter}
              onChange={(event) => setSortFilter(event.currentTarget.value)}
            >
              <option value="recent">Most Recent</option>
              <option value="amount-high">Highest Amount</option>
              <option value="amount-low">Lowest Amount</option>
            </select>
          </label>
        </div>

        <p className="commission-results-count">
          Showing {filteredOrders.length} order
          {filteredOrders.length === 1 ? "" : "s"}
        </p>

        {filteredOrders.length === 0 ? (
          <div className="commission-empty-state">
            <div className="commission-empty-icon" aria-hidden="true">
              <FileText size={56} />
              <span />
            </div>
            <strong>No commission orders found</strong>
            <p>No commission orders match your current filters.</p>
          </div>
        ) : (
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{formatTableDate(order.createdAt)}</td>
                    <td>{order.programName}</td>
                    <td>{order.status === "paid" ? "Paid" : "Unpaid"}</td>
                    <td>{formatCurrency(order.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
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
  searchParams,
  children,
}: {
  tab: StaffTab;
  activeTab: StaffTab;
  employeeId: string;
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
  const href = query
    ? `/app/staff/${employeeId}?${query}`
    : `/app/staff/${employeeId}`;

  return (
    <Link
      className={`detail-tab${activeTab === tab ? " active" : ""}`}
      to={href}
    >
      {children}
    </Link>
  );
}

function resolveDateRange(searchParams: URLSearchParams): DateRangeValue {
  const start = normalizeDateKey(searchParams.get("start"));
  const end = normalizeDateKey(searchParams.get("end"));
  if (start && end && start <= end) {
    return {
      start,
      end,
      custom: true,
      days: 0,
      label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
    };
  }

  const days = Number(searchParams.get("days"));
  if ([1, 2, 7, 30, 90, 365].includes(days)) {
    return rangeFromPreset(days);
  }

  return defaultDateRangeValue(30);
}

function normalizeDateKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function startOfDayFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function toDateKeyLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfDayFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
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

  .date-control {
    justify-self: end;
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
    gap: 14px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-card {
    align-items: center;
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: flex;
    gap: 14px;
    min-height: 88px;
    min-width: 0;
    padding: 20px 22px;
  }

  .metric-icon {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    flex-shrink: 0;
    height: 44px;
    justify-content: center;
    width: 44px;
  }

  .metric-icon svg {
    height: 20px;
    width: 20px;
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
    gap: 4px;
    min-width: 0;
  }

  .metric-copy span {
    color: #616161;
    font-size: 13px;
  }

  .metric-copy strong {
    color: #303030;
    font-size: 20px;
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
    gap: 14px;
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

  .commission-tab {
    display: grid;
    gap: 16px;
  }

  .commission-metrics {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .commission-orders-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    overflow: hidden;
  }

  .commission-orders-header {
    align-items: center;
    display: flex;
    gap: 8px;
    padding: 16px 20px 4px;
  }

  .commission-orders-header strong {
    font-size: 15px;
  }

  .commission-filters {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 12px 20px;
  }

  .commission-filters select {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 8px;
    color: #303030;
    font-size: 13px;
    min-height: 36px;
    padding: 8px 12px;
    width: 100%;
  }

  .commission-results-count {
    color: #616161;
    font-size: 13px;
    margin: 0;
    padding: 0 20px 8px;
  }

  .commission-empty-state {
    align-items: center;
    display: grid;
    gap: 6px;
    justify-items: center;
    min-height: 260px;
    padding: 40px 24px 48px;
    text-align: center;
  }

  .commission-empty-state p {
    color: #616161;
    margin: 0;
  }

  .commission-empty-icon {
    color: #d0d0d0;
    display: grid;
    margin-bottom: 8px;
    place-items: center;
    position: relative;
  }

  .commission-empty-icon span {
    background: #f5b63b;
    border-radius: 2px;
    height: 16px;
    left: 18px;
    position: absolute;
    top: 12px;
    width: 16px;
  }

  .visually-hidden {
    border: 0;
    clip: rect(0 0 0 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }

  @media (max-width: 1100px) {
    .overview-layout {
      grid-template-columns: 1fr;
    }

    .metrics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .payroll-metrics,
    .commission-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .commission-filters {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .detail-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .metrics-grid,
    .payroll-metrics,
    .commission-metrics {
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
