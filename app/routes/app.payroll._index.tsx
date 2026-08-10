import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { Plus } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployees,
  getPayrollEntries,
} from "../services/admin.server";
import {
  formatDurationHms,
  summarizeTimeEntrySeconds,
  type HourFormat,
} from "../services/time-tracking.server";
import { getShopSettings } from "../services/settings.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const settings = await getShopSettings(shop.id);
  const [employees, entries, payments] = await Promise.all([
    getEmployees(session),
    getPayrollEntries(session, 30),
    prisma.payrollPayment.findMany({
      where: { shopId: shop.id },
      select: { employeeId: true, amount: true },
    }),
  ]);
  const reportEnd = new Date();
  const hourFormat = settings.hourFormat as HourFormat;
  const summarizeOptions = { deductBreakTime: settings.deductBreakTime };

  const summariesByEmployee = new Map<
    string,
    { totalSeconds: number; workingSeconds: number; breakSeconds: number; earnings: number }
  >();

  for (const entry of entries) {
    const summary = summarizeTimeEntrySeconds(entry, reportEnd, summarizeOptions);
    const rate = entry.hourlyRateSnapshot ?? entry.employee.hourlyRate;
    const earnings = (summary.paidSeconds / 3600) * rate;
    const current = summariesByEmployee.get(entry.employeeId) ?? {
      totalSeconds: 0,
      workingSeconds: 0,
      breakSeconds: 0,
      earnings: 0,
    };

    summariesByEmployee.set(entry.employeeId, {
      totalSeconds: current.totalSeconds + summary.totalWorkedSeconds,
      workingSeconds: current.workingSeconds + summary.paidSeconds,
      breakSeconds:
        current.breakSeconds +
        summary.paidBreakSeconds +
        summary.unpaidBreakSeconds,
      earnings: current.earnings + earnings,
    });
  }

  const paidByEmployee = new Map<string, number>();
  for (const payment of payments) {
    paidByEmployee.set(
      payment.employeeId,
      (paidByEmployee.get(payment.employeeId) ?? 0) + payment.amount,
    );
  }

  const rows = employees
    .filter((employee) => employee.status !== "ARCHIVED")
    .map((employee) => {
      const summary = summariesByEmployee.get(employee.id) ?? {
        totalSeconds: 0,
        workingSeconds: 0,
        breakSeconds: 0,
        earnings: 0,
      };
      const totalPaid = paidByEmployee.get(employee.id) ?? 0;
      const remaining = Math.max(0, summary.earnings - totalPaid);

      return {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email ?? "No email",
        initials: initials(employee.firstName, employee.lastName),
        paymentType: payrollTypeLabel(employee.payrollType),
        rate: formatRate(employee),
        totalHours: formatDurationHms(summary.totalSeconds, hourFormat),
        workingHours: formatDurationHms(summary.workingSeconds, hourFormat),
        totalBreakTime: formatDurationHms(summary.breakSeconds, hourFormat),
        totalEarnings: formatMoney(summary.earnings),
        totalPaid: formatMoney(totalPaid),
        remaining: formatMoney(remaining),
      };
    });

  return { rows };
};

export default function PayrollIndexPage() {
  const { rows } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Payroll" inlineSize="large">
      <section className="payroll-card">
        <div className="payroll-table-wrap">
          <table className="payroll-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Payment Type</th>
                <th>Rate</th>
                <th>Total Hours</th>
                <th>Working Hours</th>
                <th>Total Break Time</th>
                <th>Total Earnings</th>
                <th>Total Paid</th>
                <th>Remaining</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="payroll-person">
                      <span className="payroll-avatar">{row.initials}</span>
                      <span>
                        <strong>{row.name}</strong>
                        <small>{row.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>{row.paymentType}</td>
                  <td>{row.rate}</td>
                  <td>{row.totalHours}</td>
                  <td>{row.workingHours}</td>
                  <td>{row.totalBreakTime}</td>
                  <td>{row.totalEarnings}</td>
                  <td>{row.totalPaid}</td>
                  <td>{row.remaining}</td>
                  <td>
                    <s-button
                      variant="primary"
                      href={`/app/payroll/${row.id}/create`}
                    >
                      <span className="create-payroll-label">
                        <Plus aria-hidden="true" size={14} />
                        Create Payroll
                      </span>
                    </s-button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-cell">
                    No staff available for payroll yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{PAYROLL_STYLES}</style>
    </s-page>
  );
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function payrollTypeLabel(value: string) {
  const labels: Record<string, string> = {
    HOURLY: "Hourly",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
  };
  return labels[value] ?? value;
}

function formatRate(employee: {
  payrollType: string;
  hourlyRate: number;
  salaryAmount: number;
}) {
  const amount =
    employee.payrollType === "HOURLY"
      ? employee.hourlyRate
      : employee.salaryAmount;
  return formatMoney(amount);
}

function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const PAYROLL_STYLES = `
  .payroll-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    overflow: hidden;
  }

  .payroll-table-wrap {
    overflow-x: auto;
  }

  .payroll-table {
    border-collapse: collapse;
    min-width: 1100px;
    width: 100%;
  }

  .payroll-table th,
  .payroll-table td {
    border-bottom: 1px solid #ececec;
    color: #303030;
    font-size: 13px;
    padding: 14px 16px;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }

  .payroll-table th {
    background: #f6f6f7;
    color: #616161;
    font-weight: 600;
  }

  .payroll-table tr:last-child td {
    border-bottom: 0;
  }

  .payroll-person {
    align-items: center;
    display: flex;
    gap: 10px;
    min-width: 180px;
  }

  .payroll-person strong,
  .payroll-person small {
    display: block;
  }

  .payroll-person small {
    color: #616161;
    margin-top: 2px;
  }

  .payroll-avatar {
    align-items: center;
    background: #f4a7c2;
    border-radius: 8px;
    color: #fff;
    display: inline-flex;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 700;
    height: 34px;
    justify-content: center;
    width: 34px;
  }

  .create-payroll-label {
    align-items: center;
    display: inline-flex;
    gap: 4px;
  }

  .empty-cell {
    color: #616161;
    padding: 28px 16px !important;
    text-align: center !important;
  }
`;
