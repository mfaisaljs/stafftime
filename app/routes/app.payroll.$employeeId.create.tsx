import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ChangeEvent, ReactNode } from "react";
import { AppPage } from "../components/AppPage";
import { useMemo, useRef, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { Building2, Upload, User, Wallet } from "lucide-react";
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
import { useSaveBarToast } from "../hooks/useSaveBarToast";
import { useAppPath } from "../hooks/useAppPath";
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
  { value: "REVOLUT", label: "Revolut" },
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

  const [timeEntries, payments, timeOffRequests, shifts, pendingCommissions] =
    await Promise.all([
    getEmployeeTimeEntries(session, employeeId, effectiveStart, endDate),
    prisma.payrollPayment.findMany({
      where: { shopId: shop.id, employeeId },
      select: { amount: true, paymentType: true },
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
    prisma.commissionAttribution.findMany({
      where: {
        shopId: shop.id,
        employeeId,
        payoutStatus: "PENDING",
      },
      orderBy: { createdAt: "desc" },
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
  const baseEarnings = Number(totalEarningsBase.toFixed(2));
  const adjustment = Number(salaryAdjustment.toFixed(2));
  const totalEarnings = Number((baseEarnings + adjustment).toFixed(2));
  const paidByType = payments.reduce(
    (acc, payment) => {
      const amount = payment.amount;
      const type = payment.paymentType || "SALARY";
      if (type === "COMMISSION") acc.commission += amount;
      else if (type === "BONUS") acc.bonus += amount;
      else acc.salary += amount;
      acc.total += amount;
      return acc;
    },
    { salary: 0, commission: 0, bonus: 0, total: 0 },
  );
  const salaryPaid = Number(paidByType.salary.toFixed(2));
  const commissionPaid = Number(paidByType.commission.toFixed(2));
  const bonusPaid = Number(paidByType.bonus.toFixed(2));
  const totalPaid = Number(paidByType.total.toFixed(2));
  const remaining = Math.max(0, Number((totalEarnings - salaryPaid).toFixed(2)));

  const commissionOrders = pendingCommissions.map((row) => {
    let programNames: string[] = [];
    try {
      const parsed = JSON.parse(row.lineItemsJson) as unknown;
      if (Array.isArray(parsed)) {
        const names = new Set<string>();
        for (const line of parsed) {
          if (
            line &&
            typeof line === "object" &&
            typeof (line as { programName?: unknown }).programName === "string"
          ) {
            const name = (line as { programName: string }).programName.trim();
            if (name) names.add(name);
          }
        }
        programNames = [...names];
      }
    } catch {
      programNames = [];
    }

    return {
      id: row.id,
      orderId: row.orderId,
      orderName: row.orderName?.trim() || `Order ${row.orderId}`,
      amount: Number(row.commissionTotal.toFixed(2)),
      currency: row.currency || employee.currency || "USD",
      programNames,
      createdAt: row.createdAt.toISOString(),
      createdAtLabel: row.createdAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  });
  const commissionAvailable = Number(
    commissionOrders.reduce((sum, order) => sum + order.amount, 0).toFixed(2),
  );

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
      paymentMethod:
        employee.paymentMethod === "PAYSTACK"
          ? "REVOLUT"
          : employee.paymentMethod || "PAYPAL",
      rateLabel: formatRateLabel(employee),
      paypalEmail: employee.paypalEmail ?? "",
      paypalAccountName: employee.paypalAccountName ?? "",
      bankAccountType: employee.bankAccountType ?? "",
      bankName: employee.bankName ?? "",
      accountHolderName: employee.accountHolderName ?? "",
      accountNumber: employee.accountNumber ?? "",
      routingNumber: employee.routingNumber ?? "",
      swiftBic: employee.swiftBic ?? "",
      iban: employee.iban ?? "",
    },
    overview: {
      hoursWorked: formatDurationHms(totalWorkedSeconds, hourFormat),
      baseEarnings,
      salaryAdjustment: adjustment,
      totalEarnings,
      salaryPaid,
      commissionPaid,
      bonusPaid,
      totalPaid,
      remaining,
      commissionRemaining: commissionAvailable,
      pendingPayments: remaining,
      dailyRate: Number(
        (settings.defaultDailyWorkingHours * employee.hourlyRate).toFixed(2),
      ),
      defaultDailyWorkingHours: settings.defaultDailyWorkingHours,
    },
    commission: {
      available: commissionAvailable,
      orders: commissionOrders,
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
  const selectedCommissionIds = formData
    .getAll("commissionOrderIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
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

  let commissionRows: Array<{
    id: string;
    orderName: string | null;
    orderId: string;
    commissionTotal: number;
  }> = [];
  if (paymentType === "COMMISSION") {
    if (selectedCommissionIds.length === 0) {
      return { error: "Select at least one commission order to pay." };
    }
    commissionRows = await prisma.commissionAttribution.findMany({
      where: {
        shopId: shop.id,
        employeeId,
        payoutStatus: "PENDING",
        id: { in: selectedCommissionIds },
      },
      select: {
        id: true,
        orderName: true,
        orderId: true,
        commissionTotal: true,
      },
    });
    if (commissionRows.length !== selectedCommissionIds.length) {
      return {
        error:
          "One or more selected commission orders are unavailable or already paid.",
      };
    }
    const expected = Number(
      commissionRows
        .reduce((sum, row) => sum + row.commissionTotal, 0)
        .toFixed(2),
    );
    if (Math.abs(expected - amount) > 0.009) {
      return {
        error: `Commission amount must match the selected orders (${expected.toFixed(2)}).`,
      };
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

  const commissionNote =
    paymentType === "COMMISSION"
      ? `Commission orders: ${commissionRows
          .map((row) => row.orderName?.trim() || row.orderId)
          .join(", ")}`
      : null;

  const notes =
    paymentType === "BONUS"
      ? [bonusReason && `Bonus reason: ${bonusReason}`, notesRaw]
          .filter(Boolean)
          .join("\n\n") || null
      : paymentType === "COMMISSION"
        ? [commissionNote, notesRaw].filter(Boolean).join("\n\n") || null
        : notesRaw || null;

  await prisma.$transaction(async (tx) => {
    await tx.payrollPayment.create({
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

    if (paymentType === "COMMISSION" && commissionRows.length > 0) {
      await tx.commissionAttribution.updateMany({
        where: {
          shopId: shop.id,
          employeeId,
          id: { in: commissionRows.map((row) => row.id) },
          payoutStatus: "PENDING",
        },
        data: { payoutStatus: "PAID" },
      });
    }
  });

  return redirect("/app/payroll?saved=1");
};

export default function CreatePayrollPage() {
  const { employee, overview, commission } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  useSaveBarToast(actionData);
  const appPath = useAppPath();
  const navigation = useNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proofName, setProofName] = useState("");
  const [paymentType, setPaymentType] = useState("SALARY");
  const [paymentMethod, setPaymentMethod] = useState(employee.paymentMethod);
  const [amount, setAmount] = useState(overview.remaining.toFixed(2));
  const [period, setPeriod] = useState<DateRangeValue>(() =>
    defaultDateRangeValue(2),
  );
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<string[]>(
    () => commission.orders.map((order) => order.id),
  );
  const isSubmitting = navigation.state === "submitting";

  const selectedCommissionOrders = useMemo(
    () =>
      commission.orders.filter((order) =>
        selectedCommissionIds.includes(order.id),
      ),
    [commission.orders, selectedCommissionIds],
  );
  const commissionAvailable = commission.available;
  const commissionOrderTotal = commission.orders.length;
  const selectedOrderCount = selectedCommissionOrders.length;
  const selectedCommissionTotal = Number(
    selectedCommissionOrders
      .reduce((sum, order) => sum + order.amount, 0)
      .toFixed(2),
  );
  const selectedAmount =
    paymentType === "COMMISSION"
      ? selectedCommissionTotal
      : Number.parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;

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
    if (value === "COMMISSION") {
      const ids = commission.orders.map((order) => order.id);
      setSelectedCommissionIds(ids);
      const total = Number(
        commission.orders
          .reduce((sum, order) => sum + order.amount, 0)
          .toFixed(2),
      );
      setAmount(total.toFixed(2));
      return;
    }
    setAmount("0.00");
  };

  const toggleCommissionOrder = (orderId: string) => {
    setSelectedCommissionIds((prev) => {
      const next = prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId];
      const total = Number(
        commission.orders
          .filter((order) => next.includes(order.id))
          .reduce((sum, order) => sum + order.amount, 0)
          .toFixed(2),
      );
      setAmount(total.toFixed(2));
      return next;
    });
  };

  const toggleAllCommissionOrders = (checked: boolean) => {
    if (!checked) {
      setSelectedCommissionIds([]);
      setAmount("0.00");
      return;
    }
    const ids = commission.orders.map((order) => order.id);
    setSelectedCommissionIds(ids);
    setAmount(commissionAvailable.toFixed(2));
  };

  const onProofChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setProofName(file?.name ?? "");
  };

  return (
    <AppPage heading="Create Payroll" inlineSize="large">
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
                label="Salary remaining"
                value={formatMoney(overview.remaining)}
                highlight
              />
              <MetricTile
                label="Commission remaining"
                value={formatMoney(overview.commissionRemaining)}
              />
            </div>

            <div className="overview-panels">
              <div className="overview-panel">
                <h3>Earnings breakdown</h3>
                <div className="history-row">
                  <div>
                    <span>Hours pay</span>
                    <strong>{formatMoney(overview.baseEarnings)}</strong>
                  </div>
                  <div>
                    <span>Salary adjustments</span>
                    <strong
                      className={
                        overview.salaryAdjustment < 0
                          ? "tone-red"
                          : overview.salaryAdjustment > 0
                            ? "tone-green"
                            : undefined
                      }
                    >
                      {overview.salaryAdjustment > 0 ? "+" : ""}
                      {formatMoney(overview.salaryAdjustment)}
                    </strong>
                  </div>
                </div>
                <p className="overview-hint">
                  Adjustments come from Settings (paid leave credits, unpaid leave /
                  absence deductions at{" "}
                  {overview.defaultDailyWorkingHours}h × rate ={" "}
                  {formatMoney(overview.dailyRate)} per day).
                </p>
              </div>
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
                    <span>Salary paid</span>
                    <strong className="tone-blue">
                      {formatMoney(overview.salaryPaid)}
                    </strong>
                  </div>
                </div>
                <div className="history-row" style={{ marginTop: 12 }}>
                  <div>
                    <span>Commission paid</span>
                    <strong className="tone-blue">
                      {formatMoney(overview.commissionPaid)}
                    </strong>
                  </div>
                  <div>
                    <span>Bonus paid</span>
                    <strong className="tone-blue">
                      {formatMoney(overview.bonusPaid)}
                    </strong>
                  </div>
                </div>
                <div className="schedule-row" style={{ marginTop: 12 }}>
                  <span>Total paid</span>
                  <strong>{formatMoney(overview.totalPaid)}</strong>
                </div>
                <div className="schedule-row" style={{ marginTop: 8 }}>
                  <span>Salary remaining</span>
                  <strong>{formatMoney(overview.remaining)}</strong>
                </div>
                <div className="schedule-row" style={{ marginTop: 8 }}>
                  <span>Commission remaining</span>
                  <strong>{formatMoney(overview.commissionRemaining)}</strong>
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

                {commission.orders.length === 0 ? (
                  <p className="commission-empty">
                    No pending commission orders for this staff member.
                  </p>
                ) : (
                  <div className="commission-orders">
                    <label className="commission-order-row select-all">
                      <input
                        type="checkbox"
                        checked={
                          selectedCommissionIds.length ===
                            commission.orders.length &&
                          commission.orders.length > 0
                        }
                        onChange={(event) =>
                          toggleAllCommissionOrders(event.currentTarget.checked)
                        }
                      />
                      <span>Select all pending orders</span>
                    </label>
                    {commission.orders.map((order) => (
                      <label key={order.id} className="commission-order-row">
                        <input
                          type="checkbox"
                          name="commissionOrderIds"
                          value={order.id}
                          checked={selectedCommissionIds.includes(order.id)}
                          onChange={() => toggleCommissionOrder(order.id)}
                        />
                        <span className="commission-order-meta">
                          <strong>{order.orderName}</strong>
                          <small>
                            {order.createdAtLabel}
                            {order.programNames.length > 0
                              ? ` · ${order.programNames.join(", ")}`
                              : ""}
                          </small>
                        </span>
                        <strong className="commission-order-amount">
                          {formatMoney(order.amount)}
                        </strong>
                      </label>
                    ))}
                  </div>
                )}

                <label className="field-label">
                  Total commission amount
                  <span className="amount-input">
                    <span>$</span>
                    <input
                      name="amount"
                      type="text"
                      inputMode="decimal"
                      value={selectedCommissionTotal.toFixed(2)}
                      readOnly
                      required
                    />
                  </span>
                  <small>
                    {selectedOrderCount} order
                    {selectedOrderCount === 1 ? "" : "s"} selected for payment
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
              <select
                name="paymentMethod"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.currentTarget.value)
                }
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <StaffPaymentDetailsCard
              employee={employee}
              paymentMethod={paymentMethod}
            />

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
            <s-button href={appPath("/app/payroll")} variant="secondary">
              Cancel
            </s-button>
          </div>
        </s-stack>
      </Form>

      <style>{CREATE_PAYROLL_STYLES}</style>
    </AppPage>
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

type StaffPaymentEmployee = {
  id: string;
  currency: string;
  paymentMethod: string;
  paypalEmail: string;
  paypalAccountName: string;
  bankAccountType: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  routingNumber: string;
  swiftBic: string;
  iban: string;
};

function StaffPaymentDetailsCard({
  employee,
  paymentMethod,
}: {
  employee: StaffPaymentEmployee;
  paymentMethod: string;
}) {
  const meta = paymentMethodMeta(paymentMethod);
  const details = paymentDetailsForMethod(employee, paymentMethod);
  const rows = paymentDetailRows(details, paymentMethod);
  const incomplete = !paymentDetailsComplete(details, paymentMethod);
  const Icon = meta.icon;

  return (
    <div className="payment-details-panel">
      <div className="payment-details-header">
        <div>
          <strong>Staff Payment Details</strong>
          <span>Review payment details before processing</span>
        </div>
        <span className="payment-details-badge">{meta.label}</span>
      </div>

      <div className="payment-details-method">
        <span className="payment-details-method-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <div>
          <strong>{meta.detailsTitle}</strong>
          <span>{meta.detailsDescription}</span>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="payment-details-card">
          <h4>{meta.sectionTitle}</h4>
          <dl className="payment-details-list">
            {rows.map((row) => {
              const display = displayPaymentValue(row.value, row.emptyDisplay);
              return (
                <div key={row.label} className="payment-details-row">
                  <dt>{row.label}</dt>
                  <dd
                    className={
                      display === "Not set" || display === "—"
                        ? "muted"
                        : undefined
                    }
                  >
                    {display}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : (
        <div className="payment-details-card">
          <p className="payment-details-empty">
            No extra account details are required for {meta.label}.
          </p>
        </div>
      )}

      {incomplete ? (
        <div className="payment-details-warning">
          <div>
            <strong>Incomplete payment details</strong>
            <p>
              Some required payment details are missing. Please update the staff
              profile.
            </p>
          </div>
          <s-button
            href={appPath(`/app/staff/${employee.id}/edit`)}
            variant="secondary"
          >
            Update staff profile
          </s-button>
        </div>
      ) : null}
    </div>
  );
}

function paymentMethodMeta(method: string) {
  const label =
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ??
    method;

  switch (method) {
    case "BANK_TRANSFER":
      return {
        label,
        icon: Building2,
        detailsTitle: "Bank Transfer Details",
        detailsDescription: "Direct bank transfer to staff account",
        sectionTitle: "Bank Account Information",
      };
    case "DIRECT_DEPOSIT":
      return {
        label,
        icon: Building2,
        detailsTitle: "Direct Deposit Details",
        detailsDescription: "Deposit directly to staff bank account",
        sectionTitle: "Bank Account Information",
      };
    case "PAYPAL":
      return {
        label,
        icon: Wallet,
        detailsTitle: "PayPal Details",
        detailsDescription: "Pay via PayPal to staff account",
        sectionTitle: "PayPal Account Information",
      };
    case "STRIPE":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Stripe Details",
        detailsDescription: "Pay via Stripe to staff account",
        sectionTitle: "Stripe Account Information",
      };
    case "WISE":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Wise Details",
        detailsDescription: "Pay via Wise to staff account",
        sectionTitle: "Wise Account Information",
      };
    case "PAYONEER":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Payoneer Details",
        detailsDescription: "Pay via Payoneer to staff account",
        sectionTitle: "Payoneer Account Information",
      };
    case "REVOLUT":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Revolut Details",
        detailsDescription: "Pay via Revolut to staff account",
        sectionTitle: "Revolut Account Information",
      };
    case "VENMO":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Venmo Details",
        detailsDescription: "Pay via Venmo to staff account",
        sectionTitle: "Venmo Account Information",
      };
    case "SQUARE":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Cash App Details",
        detailsDescription: "Pay via Cash App to staff account",
        sectionTitle: "Cash App Account Information",
      };
    case "CASH":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Cash Payment",
        detailsDescription: "Pay staff in cash",
        sectionTitle: "Payment Information",
      };
    case "CHECK":
      return {
        label,
        icon: Wallet,
        detailsTitle: "Check Payment",
        detailsDescription: "Pay staff by check",
        sectionTitle: "Payment Information",
      };
    default:
      return {
        label,
        icon: Wallet,
        detailsTitle: `${label} Details`,
        detailsDescription: `Pay via ${label}`,
        sectionTitle: "Account Information",
      };
  }
}

function isBankPaymentMethod(method: string) {
  return method === "BANK_TRANSFER" || method === "DIRECT_DEPOSIT";
}

/** Profile fields are shared across methods; only expose them for the staff member's saved method. */
function paymentDetailsForMethod(
  employee: StaffPaymentEmployee,
  selectedMethod: string,
): StaffPaymentEmployee {
  const saved = employee.paymentMethod;
  const methodMatches =
    selectedMethod === saved ||
    (isBankPaymentMethod(selectedMethod) && isBankPaymentMethod(saved));

  if (methodMatches) {
    return employee;
  }

  return {
    ...employee,
    paypalEmail: "",
    paypalAccountName: "",
    bankAccountType: "",
    bankName: "",
    accountHolderName: "",
    accountNumber: "",
    routingNumber: "",
    swiftBic: "",
    iban: "",
  };
}

function paymentDetailRows(
  employee: StaffPaymentEmployee,
  method: string,
): Array<{ label: string; value: string; emptyDisplay?: string }> {
  const bankTypeLabel =
    employee.bankAccountType === "INTERNATIONAL"
      ? "International (SWIFT)"
      : employee.bankAccountType === "DOMESTIC"
        ? "Domestic"
        : "";

  switch (method) {
    case "BANK_TRANSFER":
    case "DIRECT_DEPOSIT": {
      const rows: Array<{
        label: string;
        value: string;
        emptyDisplay?: string;
      }> = [
        { label: "Bank name", value: employee.bankName },
        {
          label: "Account type",
          value: bankTypeLabel,
          emptyDisplay: "—",
        },
        { label: "Account holder", value: employee.accountHolderName },
        { label: "Account number", value: employee.accountNumber },
      ];
      if (employee.bankAccountType === "DOMESTIC") {
        rows.push({ label: "Routing number", value: employee.routingNumber });
      } else {
        rows.push(
          { label: "SWIFT/BIC", value: employee.swiftBic },
          { label: "IBAN", value: employee.iban },
        );
      }
      return rows;
    }
    case "PAYPAL":
      return [
        { label: "PayPal email", value: employee.paypalEmail },
        { label: "Account name", value: employee.paypalAccountName },
      ];
    case "STRIPE":
      return [
        { label: "Account email", value: employee.paypalEmail },
        { label: "Account ID", value: employee.paypalAccountName },
      ];
    case "WISE":
      return [
        { label: "Wise email", value: employee.paypalEmail },
        { label: "Account holder", value: employee.paypalAccountName },
        { label: "Currency", value: employee.currency },
      ];
    case "PAYONEER":
      return [
        { label: "Payoneer email", value: employee.paypalEmail },
        { label: "Account name", value: employee.paypalAccountName },
      ];
    case "REVOLUT":
      return [
        { label: "Email/Phone", value: employee.paypalEmail },
        { label: "Username", value: employee.paypalAccountName },
      ];
    case "VENMO":
      return [
        { label: "Username", value: employee.paypalAccountName },
        { label: "Phone number", value: employee.paypalEmail },
      ];
    case "SQUARE":
      return [
        { label: "$Cashtag", value: employee.paypalAccountName },
        { label: "Phone/Email", value: employee.paypalEmail },
      ];
    default:
      return [];
  }
}

function paymentDetailsComplete(
  employee: StaffPaymentEmployee,
  method: string,
) {
  const has = (value: string) => Boolean(value.trim());

  switch (method) {
    case "CASH":
    case "CHECK":
      return true;
    case "BANK_TRANSFER":
    case "DIRECT_DEPOSIT":
      if (
        !has(employee.bankName) ||
        !has(employee.accountHolderName) ||
        !has(employee.accountNumber)
      ) {
        return false;
      }
      if (employee.bankAccountType === "DOMESTIC") {
        return has(employee.routingNumber);
      }
      return has(employee.swiftBic) && has(employee.iban);
    case "PAYPAL":
    case "STRIPE":
    case "WISE":
    case "PAYONEER":
    case "REVOLUT":
      return has(employee.paypalEmail);
    case "VENMO":
      return has(employee.paypalAccountName) || has(employee.paypalEmail);
    case "SQUARE":
      return has(employee.paypalAccountName) || has(employee.paypalEmail);
    default:
      return true;
  }
}

function displayPaymentValue(value: string, emptyDisplay = "Not set") {
  const trimmed = value.trim();
  if (!trimmed) return emptyDisplay;
  return trimmed;
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
    align-items: start;
    display: grid;
    gap: 12px;
    grid-template-columns: 1.2fr 1fr;
  }

  .overview-panel {
    align-content: start;
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

  .tone-red {
    color: #b91c1c !important;
  }

  .overview-hint {
    color: #616161;
    font-size: 12px;
    line-height: 1.4;
    margin: 12px 0 0;
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

  .commission-empty {
    color: #616161;
    font-size: 13px;
    margin: 0;
  }

  .commission-orders {
    border: 1px solid #e3e3e3;
    border-radius: 10px;
    display: grid;
    gap: 0;
    overflow: hidden;
  }

  .commission-order-row {
    align-items: center;
    border-bottom: 1px solid #ececec;
    cursor: pointer;
    display: grid;
    gap: 12px;
    grid-template-columns: auto 1fr auto;
    margin: 0;
    padding: 12px 14px;
  }

  .commission-order-row:last-child {
    border-bottom: 0;
  }

  .commission-order-row.select-all {
    background: #f6f6f7;
    font-size: 13px;
    font-weight: 600;
  }

  .commission-order-meta {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .commission-order-meta strong {
    color: #202223;
    font-size: 13px;
  }

  .commission-order-meta small {
    color: #616161;
    font-size: 12px;
  }

  .commission-order-amount {
    color: #202223;
    font-size: 13px;
    white-space: nowrap;
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

  .payment-details-panel {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 12px;
    overflow: hidden;
    padding: 16px;
  }

  .payment-details-header {
    align-items: start;
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .payment-details-header > div {
    display: grid;
    gap: 2px;
  }

  .payment-details-header span {
    color: #616161;
    font-size: 13px;
  }

  .payment-details-badge {
    background: #eaf7ee;
    border-radius: 999px;
    color: #0d7a3d;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
  }

  .payment-details-method {
    align-items: center;
    background: #f6f6f7;
    border-radius: 10px;
    display: flex;
    gap: 10px;
    padding: 12px;
  }

  .payment-details-method-icon {
    align-items: center;
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 8px;
    color: #4a4a4a;
    display: inline-flex;
    flex-shrink: 0;
    height: 32px;
    justify-content: center;
    width: 32px;
  }

  .payment-details-method > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .payment-details-method span {
    color: #616161;
    font-size: 12px;
  }

  .payment-details-card {
    background: #fafafa;
    border: 1px solid #ececec;
    border-radius: 10px;
    display: grid;
    gap: 10px;
    padding: 14px;
  }

  .payment-details-card h4 {
    color: #303030;
    font-size: 13px;
    font-weight: 650;
    margin: 0;
  }

  .payment-details-empty {
    color: #616161;
    font-size: 13px;
    margin: 0;
  }

  .payment-details-list {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .payment-details-row {
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(110px, 150px) 1fr;
  }

  .payment-details-row dt {
    color: #616161;
    font-size: 13px;
  }

  .payment-details-row dd {
    color: #303030;
    font-size: 13px;
    margin: 0;
    text-align: right;
    word-break: break-word;
  }

  .payment-details-row dd.muted {
    color: #8c8c8c;
  }

  .payment-details-warning {
    align-items: center;
    background: #fff6e8;
    border: 1px solid #f3d9a8;
    border-radius: 10px;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .payment-details-warning > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .payment-details-warning strong {
    color: #8a5a00;
    font-size: 13px;
  }

  .payment-details-warning p {
    color: #8a5a00;
    font-size: 12px;
    margin: 0;
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

    .payment-details-warning {
      align-items: stretch;
      flex-direction: column;
    }

    .payment-details-row {
      grid-template-columns: 1fr;
    }

    .payment-details-row dd {
      text-align: left;
    }
  }
`;
