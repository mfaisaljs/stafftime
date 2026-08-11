import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { Upload, User } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeById,
  getEmployeeTimeEntries,
} from "../services/admin.server";
import {
  formatDurationHms,
  summarizeTimeEntrySeconds,
  type HourFormat,
} from "../services/time-tracking.server";
import {
  clampRangeStartForSalary,
  computeSalaryAdjustments,
  enumerateDateKeys,
  getApprovedTimeOffForRange,
  getShopSettings,
} from "../services/settings.server";
import { SHIFT_STATUS } from "../services/time-off-shifts.server";
import {
  DateRangeSelector,
  defaultDateRangeValue,
  type DateRangeValue,
} from "../components/DateRangeSelector";
import prisma from "../db.server";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PROOF_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

const PAYMENT_TYPE_OPTIONS = [
  { value: "SALARY", label: "Salary" },
  { value: "COMMISSION", label: "Commission" },
  { value: "BONUS", label: "Bonus" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "PAYPAL", label: "PayPal" },
  { value: "STRIPE", label: "Stripe" },
  { value: "WISE", label: "Wise" },
  { value: "PAYONEER", label: "Payoneer" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "DIRECT_DEPOSIT", label: "Direct Deposit" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "PAYSTACK", label: "Paystack" },
  { value: "VENMO", label: "Venmo" },
  { value: "SQUARE", label: "Square" },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  if (!employeeId) throw new Response("Staff member not found", { status: 404 });

  const employee = await getEmployeeById(session, employeeId);
  if (!employee || employee.status === "ARCHIVED") {
    throw new Response("Staff member not found", { status: 404 });
  }

  const shop = await getAdminShop(session);
  const settings = await getShopSettings(shop.id);
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  startDate.setHours(0, 0, 0, 0);
  const effectiveStart = await clampRangeStartForSalary(
    shop.id,
    employeeId,
    startDate,
    settings,
  );

  const [timeEntries, payments, timeOffRequests, shifts] = await Promise.all([
    getEmployeeTimeEntries(session, employeeId, effectiveStart, endDate),
    prisma.payrollPayment.findMany({
      where: { shopId: shop.id, employeeId },
      select: { amount: true },
    }),
    getApprovedTimeOffForRange(
      shop.id,
      toDateKeyLocal(effectiveStart),
      toDateKeyLocal(endDate),
    ),
    prisma.shift.findMany({
      where: {
        shopId: shop.id,
        employeeId,
        status: {
          in: [SHIFT_STATUS.SCHEDULED, SHIFT_STATUS.CANCELLED_LEAVE],
        },
        startsAt: { gte: effectiveStart, lte: endDate },
      },
    }),
  ]);

  const reportEnd = new Date();
  const summarizeOptions = { deductBreakTime: settings.deductBreakTime };
  const hourFormat = settings.hourFormat as HourFormat;
  const summaries = timeEntries.map((entry) =>
    summarizeTimeEntrySeconds(entry, reportEnd, summarizeOptions),
  );
  const totalWorkedSeconds = summaries.reduce(
    (sum, item) => sum + item.totalWorkedSeconds,
    0,
  );
  const totalEarningsBase = timeEntries.reduce((sum, entry, index) => {
    const hourlyRate = entry.hourlyRateSnapshot ?? employee.hourlyRate;
    return sum + (summaries[index].paidSeconds / 3600) * hourlyRate;
  }, 0);
  const dateKeys = enumerateDateKeys(
    toDateKeyLocal(effectiveStart),
    toDateKeyLocal(endDate),
  );
  const shiftsByDate = new Map<string, boolean>();
  for (const shift of shifts) {
    shiftsByDate.set(toDateKeyLocal(shift.startsAt), true);
  }
  const clockedDates = new Set(
    timeEntries.map((entry) => toDateKeyLocal(entry.clockInAt)),
  );
  const salaryAdjustment = computeSalaryAdjustments({
    employee,
    dateKeys,
    shiftsByDate,
    clockedDates,
    requests: timeOffRequests.filter((request) => request.employeeId === employeeId),
    settings,
  });
  const totalEarnings = totalEarningsBase + salaryAdjustment;
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, totalEarnings - totalPaid);

  return {
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      email: employee.email ?? "No email",
      initials: initials(employee.firstName, employee.lastName),
      payrollType: employee.payrollType,
      payrollTypeLabel: payrollTypeLabel(employee.payrollType),
      hourlyRate: employee.hourlyRate,
      salaryAmount: employee.salaryAmount,
      currency: employee.currency,
      paymentMethod: employee.paymentMethod || "PAYPAL",
      rateLabel: formatRateLabel(employee),
    },
    overview: {
      hoursWorked: formatDurationHms(totalWorkedSeconds, hourFormat),
      totalEarnings,
      totalPaid,
      remaining,
      pendingPayments: remaining,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  if (!employeeId) return { error: "Staff member not found" };

  const shop = await getAdminShop(session);
  const employee = await getEmployeeById(session, employeeId);
  if (!employee || employee.status === "ARCHIVED") {
    return { error: "Staff member not found" };
  }

  const formData = await request.formData();
  const paymentType = String(formData.get("paymentType") ?? "SALARY");
  const paymentMethod = String(formData.get("paymentMethod") ?? "PAYPAL");
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  const periodLabel = String(formData.get("periodLabel") ?? "").trim();
  const bonusReason = String(formData.get("bonusReason") ?? "").trim();
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").replace(/[^0-9.]/g, "");
  const amount = Number.parseFloat(amountRaw);
  const proof = formData.get("proof");
  const allowedPaymentTypes = new Set(
    PAYMENT_TYPE_OPTIONS.map((option) => option.value),
  );

  if (!allowedPaymentTypes.has(paymentType)) {
    return { error: "Payment type must be Salary, Commission, or Bonus." };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid payment amount greater than zero." };
  }

  if (paymentType === "SALARY") {
    if (!isDateKey(periodStart) || !isDateKey(periodEnd) || periodStart > periodEnd) {
      return { error: "Select a valid payment period." };
    }
  }

  let proofFileName: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    if (proof.size > MAX_PROOF_BYTES) {
      return { error: "Payment proof must be 5MB or smaller." };
    }
    const type = proof.type.toLowerCase();
    const name = proof.name.toLowerCase();
    const allowedExt =
      name.endsWith(".pdf") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg");
    if (!ACCEPTED_PROOF_TYPES.includes(type) && !allowedExt) {
      return { error: "Accepted file types: PDF, PNG, JPG, JPEG." };
    }
    proofFileName = proof.name.slice(0, 180);
  }

  const notes =
    paymentType === "BONUS"
      ? [bonusReason && `Bonus reason: ${bonusReason}`, notesRaw]
          .filter(Boolean)
          .join("\n\n") || null
      : notesRaw || null;

  await prisma.payrollPayment.create({
    data: {
      shopId: shop.id,
      employeeId,
      paymentType,
      amount,
      currency: employee.currency || "USD",
      paymentMethod,
      notes,
      proofFileName,
      periodLabel:
        paymentType === "SALARY"
          ? periodLabel || `${periodStart} - ${periodEnd}`
          : null,
      periodStart: paymentType === "SALARY" ? periodStart : null,
      periodEnd: paymentType === "SALARY" ? periodEnd : null,
    },
  });

  return redirect("/app/payroll");
};

export default function CreatePayrollPage() {
  const { employee, overview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proofName, setProofName] = useState("");
  const [paymentType, setPaymentType] = useState("SALARY");
  const [amount, setAmount] = useState(overview.remaining.toFixed(2));
  const [period, setPeriod] = useState<DateRangeValue>(() =>
    defaultDateRangeValue(2),
  );
  const isSubmitting = navigation.state === "submitting";

  // Commission order ledger is not persisted yet — keep zeros until orders exist.
  const commissionAvailable = 0;
  const commissionOrderTotal = 0;
  const selectedOrderCount = 0;
  const selectedAmount = Number.parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;

  const amountHelp = useMemo(
    () => ({
      unpaid: formatMoney(overview.remaining),
      rate: employee.rateLabel,
    }),
    [employee.rateLabel, overview.remaining],
  );

  const onPaymentTypeChange = (value: string) => {
    setPaymentType(value);
    if (value === "SALARY") {
      setAmount(overview.remaining.toFixed(2));
      return;
    }
    setAmount("0.00");
  };

  const onProofChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setProofName(file?.name ?? "");
  };

  return (
    <s-page heading="Create Payroll" inlineSize="large">
      {actionData && "error" in actionData && actionData.error && (
        <s-banner heading={actionData.error} tone="critical" />
      )}

      <Form method="post" encType="multipart/form-data" data-save-bar>
        <s-stack direction="block" gap="large">
          <FormSection
            title="Staff Payment Overview"
            description="Review staff member payment details and view payment history"
          >
            <div className="overview-profile">
              <span className="overview-avatar" aria-hidden="true">
                {employee.initials || <User size={20} />}
              </span>
              <div className="overview-identity">
                <strong>{employee.name}</strong>
                <span>{employee.email}</span>
              </div>
              <span className="overview-badge">{employee.payrollTypeLabel}</span>
            </div>

            <div className="overview-metrics">
              <MetricTile label="Rate" value={employee.rateLabel} />
              <MetricTile label="Hours worked" value={overview.hoursWorked} />
              <MetricTile
                label="Remaining balance"
                value={formatMoney(overview.remaining)}
                highlight
              />
            </div>

            <div className="overview-panels">
              <div className="overview-panel">
                <h3>Payment History</h3>
                <div className="history-row">
                  <div>
                    <span>Total Earnings</span>
                    <strong className="tone-green">
                      {formatMoney(overview.totalEarnings)}
                    </strong>
                  </div>
                  <div>
                    <span>Total Paid</span>
                    <strong className="tone-blue">
                      {formatMoney(overview.totalPaid)}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="overview-panel">
                <h3>Payment Schedule</h3>
                <div className="schedule-row">
                  <span>Total pending payments</span>
                  <strong>{formatMoney(overview.pendingPayments)}</strong>
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Payment Details"
            description="Enter payment period, payment type and amount details."
          >
            <label className="field-label">
              Payment Type
              <select
                name="paymentType"
                value={paymentType}
                onChange={(event) => onPaymentTypeChange(event.currentTarget.value)}
              >
                {PAYMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>Select the payment type you want to process</small>
            </label>

            {paymentType === "SALARY" && (
              <>
                <div className="field-label period-field">
                  <span>Payment period</span>
                  <DateRangeSelector value={period} onChange={setPeriod} />
                </div>

                <label className="field-label">
                  Salary amount to pay
                  <span className="amount-input">
                    <span>$</span>
                    <input
                      name="amount"
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.currentTarget.value)}
                      required
                    />
                  </span>
                  <small>
                    Available unpaid salary: {amountHelp.unpaid}
                    <br />
                    Hourly rate: {amountHelp.rate}
                  </small>
                </label>
              </>
            )}

            {paymentType === "COMMISSION" && (
              <div className="commission-panel">
                <div className="commission-metrics">
                  <div className="commission-metric">
                    <span>Total available</span>
                    <strong>{formatMoney(commissionAvailable)}</strong>
                  </div>
                  <div className="commission-metric">
                    <span>Selected amount</span>
                    <strong>{formatMoney(selectedAmount)}</strong>
                  </div>
                  <div className="commission-metric">
                    <span>Selected orders</span>
                    <strong>
                      {selectedOrderCount} / {commissionOrderTotal}
                    </strong>
                  </div>
                </div>

                <label className="field-label">
                  Total commission amount
                  <span className="amount-input">
                    <span>$</span>
                    <input
                      name="amount"
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.currentTarget.value)}
                      required
                    />
                  </span>
                  <small>
                    {selectedOrderCount} Orders selected for payment
                  </small>
                </label>
              </div>
            )}

            {paymentType === "BONUS" && (
              <>
                <label className="field-label">
                  Bonus amount
                  <span className="amount-input">
                    <span>$</span>
                    <input
                      name="amount"
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.currentTarget.value)}
                      required
                    />
                  </span>
                  <small>Enter bonus amount</small>
                </label>

                <label className="field-label">
                  Bonus reason
                  <textarea
                    name="bonusReason"
                    rows={4}
                    placeholder="Enter reason for the bonus"
                  />
                </label>
              </>
            )}
          </FormSection>

          <FormSection
            title="Payment Method"
            description="Review and confirm staff payment details."
          >
            <label className="field-label">
              Payment Method
              <select name="paymentMethod" defaultValue={employee.paymentMethod}>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Additional Notes
              <textarea
                name="notes"
                rows={4}
                placeholder="Add any relevant payment notes here"
              />
            </label>
          </FormSection>

          <FormSection
            title="Payment Proof"
            description="Attach proof of payment."
          >
            <p className="proof-help">
              Accepted file types: PDF, PNG, JPG, JPEG (Max size: 5MB)
            </p>
            <div
              className="proof-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <Upload aria-hidden="true" size={22} />
              <p>Drop your file here or click to upload</p>
              {proofName ? (
                <small className="proof-filename">{proofName}</small>
              ) : null}
              <s-button type="button" variant="secondary">
                Choose File
              </s-button>
              <input
                ref={fileInputRef}
                className="proof-input"
                type="file"
                name="proof"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={onProofChange}
              />
            </div>
          </FormSection>

          <div className="form-actions">
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Create Payroll
            </s-button>
            <s-button href="/app/payroll" variant="secondary">
              Cancel
            </s-button>
          </div>
        </s-stack>
      </Form>

      <style>{CREATE_PAYROLL_STYLES}</style>
    </s-page>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="form-section">
      <div className="form-section-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="form-section-card">{children}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`metric-tile${highlight ? " highlight" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function toDateKeyLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function payrollTypeLabel(value: string) {
  const labels: Record<string, string> = {
    HOURLY: "Hourly",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
  };
  return labels[value] ?? value;
}

function formatRateLabel(employee: {
  payrollType: string;
  hourlyRate: number;
  salaryAmount: number;
}) {
  if (employee.payrollType === "HOURLY") {
    return `${formatMoney(employee.hourlyRate)}/hour`;
  }
  if (employee.payrollType === "WEEKLY") {
    return `${formatMoney(employee.salaryAmount)}/week`;
  }
  return `${formatMoney(employee.salaryAmount)}/month`;
}

function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const CREATE_PAYROLL_STYLES = `
  .form-section {
    align-items: start;
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(180px, 280px) 1fr;
    min-width: 0;
  }

  .form-section-copy {
    color: #303030;
    display: grid;
    gap: 6px;
  }

  .form-section-copy span {
    color: #616161;
    font-size: 13px;
  }

  .form-section-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 14px;
    min-width: 0;
    padding: 18px;
  }

  .overview-profile {
    align-items: center;
    border: 1px solid #ececec;
    border-radius: 12px;
    display: flex;
    gap: 12px;
    padding: 14px 16px;
  }

  .overview-avatar {
    align-items: center;
    background: #eef0f2;
    border-radius: 999px;
    color: #616161;
    display: inline-flex;
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 700;
    height: 44px;
    justify-content: center;
    width: 44px;
  }

  .overview-identity {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .overview-identity span {
    color: #616161;
    font-size: 13px;
  }

  .overview-badge {
    background: #f1f2f3;
    border-radius: 999px;
    color: #4a4a4a;
    font-size: 12px;
    font-weight: 600;
    margin-left: auto;
    padding: 4px 10px;
  }

  .overview-metrics {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-tile {
    background: #fafafa;
    border: 1px solid #ececec;
    border-radius: 10px;
    display: grid;
    gap: 6px;
    padding: 14px;
  }

  .metric-tile.highlight {
    background: #fff8e6;
    border-color: #f0e0b2;
  }

  .metric-tile span,
  .overview-panel h3,
  .history-row span,
  .schedule-row span {
    color: #616161;
    font-size: 12px;
    font-weight: 500;
  }

  .metric-tile strong,
  .history-row strong,
  .schedule-row strong {
    color: #202223;
    font-size: 18px;
  }

  .overview-panels {
    display: grid;
    gap: 12px;
    grid-template-columns: 1.2fr 1fr;
  }

  .overview-panel {
    border: 1px solid #ececec;
    border-radius: 10px;
    display: grid;
    gap: 12px;
    padding: 14px;
  }

  .overview-panel h3 {
    margin: 0;
  }

  .history-row {
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr 1fr;
  }

  .history-row > div,
  .schedule-row {
    display: grid;
    gap: 4px;
  }

  .tone-green {
    color: #008060 !important;
  }

  .tone-blue {
    color: #2c6ecb !important;
  }

  .field-label {
    color: #303030;
    display: grid;
    font-size: 13px;
    font-weight: 600;
    gap: 6px;
  }

  .field-label small,
  .proof-help {
    color: #616161;
    font-size: 12px;
    font-weight: 400;
    margin: 0;
  }

  .field-label select,
  .field-label textarea,
  .amount-input input {
    border: 1px solid #8a8a8a;
    border-radius: 8px;
    box-sizing: border-box;
    font: inherit;
    font-weight: 400;
    min-height: 36px;
    padding: 8px 10px;
    width: 100%;
  }

  .field-label textarea {
    min-height: 96px;
    resize: vertical;
  }

  .period-field {
    align-items: start;
  }

  .commission-panel {
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 14px;
    padding: 14px;
  }

  .commission-metrics {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .commission-metric {
    background: #f6f6f7;
    border-radius: 10px;
    display: grid;
    gap: 6px;
    padding: 14px;
  }

  .commission-metric span {
    color: #616161;
    font-size: 12px;
    font-weight: 500;
  }

  .commission-metric strong {
    color: #202223;
    font-size: 18px;
  }

  .amount-input {
    align-items: center;
    border: 1px solid #8a8a8a;
    border-radius: 8px;
    display: flex;
    gap: 4px;
    padding: 0 10px;
  }

  .amount-input span {
    color: #616161;
    font-weight: 500;
  }

  .amount-input input {
    border: 0;
    outline: none;
    padding-left: 0;
  }

  .proof-dropzone {
    align-items: center;
    background: #fafafa;
    border: 1px dashed #c9cccf;
    border-radius: 12px;
    cursor: pointer;
    display: grid;
    gap: 8px;
    justify-items: center;
    min-height: 160px;
    padding: 24px;
    position: relative;
    text-align: center;
  }

  .proof-dropzone p {
    color: #303030;
    margin: 0;
  }

  .proof-filename {
    color: #2c6ecb;
  }

  .proof-input {
    height: 0;
    opacity: 0;
    position: absolute;
    width: 0;
  }

  .form-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  @media (max-width: 900px) {
    .form-section,
    .overview-metrics,
    .overview-panels,
    .history-row,
    .commission-metrics {
      grid-template-columns: 1fr;
    }

    .overview-badge {
      margin-left: 0;
    }

    .form-actions {
      justify-content: stretch;
    }
  }
`;
