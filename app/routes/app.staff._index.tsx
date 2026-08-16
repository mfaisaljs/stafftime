import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Pencil, Search, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getEmployees } from "../services/admin.server";
import { ensureUsageCycle, getShopBilling, subscribedSeatsFullMessage } from "../services/billing.server";
import {
  openPricingModal,
  PricingModal,
  PRICING_MODAL_ID,
} from "../components/billing/PricingModal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureUsageCycle(session.shop);
  const [employees, billing] = await Promise.all([
    getEmployees(session),
    getShopBilling(session.shop),
  ]);

  return {
    employees,
    staffLimit: billing.staffLimit,
    includedStaff: billing.includedStaff,
    extraStaffCount: billing.extraStaffCount,
    reportedStaffUsage: billing.reportedStaffUsage,
    subscribedSeats: billing.subscribedSeats,
    planName: billing.plan.name,
    planHandle: billing.planHandle,
    pricingPlansUrl: billing.pricingPlansUrl,
    atCap: billing.atCap,
    atSubscribedCap: billing.atSubscribedCap,
    nextPlan: billing.nextPlan
      ? {
          name: billing.nextPlan.name,
          monthlyPrice: billing.nextPlan.monthlyPrice,
          includedStaff: billing.nextPlan.includedStaff,
          maxStaff: billing.nextPlan.maxStaff,
        }
      : null,
  };
};

type BulkActionResult = { success?: string; error?: string };

type StatusFilter = "all" | "active" | "inactive" | "missing_payment" | "archived";

export default function StaffManagementPage() {
  const {
    employees,
    staffLimit,
    includedStaff,
    extraStaffCount,
    reportedStaffUsage,
    subscribedSeats,
    planName,
    planHandle,
    pricingPlansUrl,
    atCap,
    atSubscribedCap,
    nextPlan,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<BulkActionResult>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [removeStaff, setRemoveStaff] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [removeMode, setRemoveMode] = useState<"archive" | "delete">("archive");
  const selectAllRef = useRef<HTMLInputElement>(null);
  const isBulkSubmitting = fetcher.state !== "idle";

  const filteredEmployees = useMemo(() => {
    let list = employees;

    switch (statusFilter) {
      case "active":
        list = list.filter((employee) => employee.status === "ACTIVE");
        break;
      case "inactive":
        list = list.filter((employee) => employee.status === "INACTIVE");
        break;
      case "missing_payment":
        list = list.filter(
          (employee) => employee.status !== "ARCHIVED" && hasMissingPaymentInfo(employee),
        );
        break;
      case "archived":
        list = list.filter((employee) => employee.status === "ARCHIVED");
        break;
      default:
        list = list.filter((employee) => employee.status !== "ARCHIVED");
        break;
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter((employee) => {
      const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
      const email = employee.email?.toLowerCase() ?? "";
      const position = (employee.position ?? "").toLowerCase();
      const location = (employee.location?.name ?? "").toLowerCase();
      const payment = paymentMethodLabel(employee.paymentMethod).toLowerCase();

      return (
        fullName.includes(query) ||
        email.includes(query) ||
        position.includes(query) ||
        location.includes(query) ||
        payment.includes(query)
      );
    });
  }, [employees, statusFilter, searchQuery]);

  const allVisibleSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every((employee) => selectedIds.has(employee.id));
  const someVisibleSelected = filteredEmployees.some((employee) =>
    selectedIds.has(employee.id),
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setSelectedIds(new Set());
      setRemoveStaff(null);
      setRemoveMode("archive");
      const modal = document.getElementById("remove-staff-modal") as
        | (HTMLElement & { hideOverlay?: () => void })
        | null;
      modal?.hideOverlay?.();
    }
  }, [fetcher.data?.success]);

  useEffect(() => {
    if (searchParams.get("pricing") === "1" || searchParams.get("billing")) {
      if (searchParams.get("pricing") === "1") {
        openPricingModal();
      }
    }
  }, [searchParams]);

  const submitBulkAction = (intent: "archive" | "delete") => {
    const formData = new FormData();
    formData.set("intent", intent);
    for (const employeeId of selectedIds) {
      formData.append("employeeIds", employeeId);
    }
    fetcher.submit(formData, { method: "post", action: "/app/staff" });
  };

  const openRemoveStaffModal = (employee: {
    id: string;
    firstName: string;
    lastName: string;
  }) => {
    setRemoveStaff({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
    });
    setRemoveMode("archive");
    const modal = document.getElementById("remove-staff-modal") as
      | (HTMLElement & { showOverlay?: () => void })
      | null;
    modal?.showOverlay?.();
  };

  const submitRemoveStaff = () => {
    if (!removeStaff) return;
    const formData = new FormData();
    formData.set("intent", removeMode);
    formData.append("employeeIds", removeStaff.id);
    fetcher.submit(formData, { method: "post", action: "/app/staff" });
  };

  const toggleSelectAll = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) {
        filteredEmployees.forEach((employee) => next.delete(employee.id));
      } else {
        filteredEmployees.forEach((employee) => next.add(employee.id));
      }
      return next;
    });
  };

  const toggleSelectOne = (employeeId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  const totalStaff = employees.filter((employee) => employee.status !== "ARCHIVED").length;
  const availableStaff = Math.max(subscribedSeats - totalStaff, 0);
  const usagePercent =
    subscribedSeats > 0
      ? Math.min(Math.round((totalStaff / subscribedSeats) * 100), 100)
      : 0;
  const activeCount = employees.filter((employee) => employee.status === "ACTIVE").length;
  const inactiveCount = employees.filter(
    (employee) => employee.status === "INACTIVE",
  ).length;
  const archivedCount = employees.filter(
    (employee) => employee.status === "ARCHIVED",
  ).length;
  const missingPaymentCount = employees.filter(
    (employee) => employee.status !== "ARCHIVED" && hasMissingPaymentInfo(employee),
  ).length;
  const selectedCount = selectedIds.size;

  return (
    <s-page heading="Staff Management" inlineSize="large">
      <s-stack direction="block" gap="large">
        <section className="plan-card">
          <div className="plan-icon">
            <Star aria-hidden="true" size={28} strokeWidth={1.75} />
          </div>
          <div className="plan-copy">
            <div className="plan-title">
              <strong>Current Plan: {planName}</strong>
              <span className="plan-chip">{planHandle === "free" ? "Starter" : planName}</span>
            </div>
            <div className="staff-usage">
              <span>
                {totalStaff} staff ({includedStaff} included
                {reportedStaffUsage > 0
                  ? ` + ${reportedStaffUsage} subscribed extra`
                  : ""}
                ) · {availableStaff} available of {subscribedSeats} subscribed
              </span>
              <div className="usage-bar" aria-label={`${usagePercent}% used`}>
                <span style={{ width: `${usagePercent}%` }} />
              </div>
              <span>{usagePercent}% used</span>
              {atCap ? (
                <strong className="limit-text">
                  {nextPlan
                    ? `${planName} max is ${staffLimit}. Upgrade to ${nextPlan.name} (up to ${nextPlan.maxStaff}).`
                    : `${planName} max is ${staffLimit} staff.`}
                </strong>
              ) : atSubscribedCap ? (
                <strong className="limit-text">
                  {subscribedSeatsFullMessage(subscribedSeats)}
                </strong>
              ) : null}
            </div>
          </div>
          <div className="plan-action">
            <span>
              {atCap && nextPlan
                ? `Upgrade to ${nextPlan.name} to add more staff`
                : atSubscribedCap
                  ? "Subscribe for extra seats on Pricing"
                  : nextPlan
                    ? `Upgrade to ${nextPlan.name} to add more staff`
                    : "Upgrade to add more staff"}
            </span>
            {atSubscribedCap && !atCap ? (
              <s-button variant="primary" href="/app/pricing">
                Add extra seats
              </s-button>
            ) : (
              <s-button
                variant="primary"
                commandFor={PRICING_MODAL_ID}
                command="--show"
              >
                {nextPlan ? `Upgrade to ${nextPlan.name}` : "Upgrade Plan"}
              </s-button>
            )}
          </div>
        </section>

        {searchParams.get("billing") && (
          <s-banner heading="Plan updated" tone="success" dismissible>
            Your subscribed seat capacity is now {subscribedSeats}.
          </s-banner>
        )}

        <div className="staff-type-tabs">
          <button className="tab active" type="button">
            Shopify Staff ({totalStaff})
          </button>
          <button className="tab" type="button">
            Non-Shopify Staff (0)
          </button>
        </div>

        <div className="staff-actions">
          {atSubscribedCap && !atCap ? (
            <s-button variant="primary" href="/app/pricing">
              Subscribe for more seats
            </s-button>
          ) : atCap ? (
            <s-button
              variant="primary"
              commandFor={PRICING_MODAL_ID}
              command="--show"
            >
              {nextPlan ? `Upgrade to ${nextPlan.name}` : "Staff limit reached"}
            </s-button>
          ) : (
            <s-button variant="primary" href="/app/staff/new">
              Add Shopify Staff
            </s-button>
          )}
          <s-button variant="secondary" disabled>
            Bulk Import
          </s-button>
        </div>

        <s-tooltip id="inactive-staff-tooltip">
          Staff automatically active when they first clock in at POS or Web Portal.
        </s-tooltip>

        {fetcher.data?.error && (
          <s-banner heading={fetcher.data.error} tone="critical" />
        )}
        {fetcher.data?.success && (
          <s-banner heading={fetcher.data.success} tone="success" />
        )}

        {selectedCount > 0 && (
          <div className="bulk-actions">
            <span className="bulk-count">{selectedCount} selected</span>
            <s-button
              type="button"
              variant="secondary"
              loading={isBulkSubmitting}
              onClick={() => submitBulkAction("archive")}
            >
              <span className="button-with-icon">
                <Archive aria-hidden="true" size={16} />
                Archive all
              </span>
            </s-button>
            <s-button
              type="button"
              variant="primary"
              tone="critical"
              commandFor="bulk-delete-modal"
              command="--show"
            >
              <span className="button-with-icon">
                <Trash2 aria-hidden="true" size={16} />
                Delete all
              </span>
            </s-button>
          </div>
        )}

        <s-modal id="bulk-delete-modal" heading="Delete staff?">
          <s-stack direction="block" gap="base">
            <s-text>
              Are you sure you want to delete {selectedCount} staff member(s)? This
              action cannot be undone.
            </s-text>
            <s-banner tone="warning">
              <s-text>
                This will permanently remove the selected staff and related workforce
                records.
              </s-text>
            </s-banner>
          </s-stack>
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            loading={isBulkSubmitting}
            commandFor="bulk-delete-modal"
            command="--hide"
            onClick={() => submitBulkAction("delete")}
          >
            Delete all
          </s-button>
          <s-button
            slot="secondary-actions"
            commandFor="bulk-delete-modal"
            command="--hide"
          >
            Cancel
          </s-button>
        </s-modal>

        <s-modal id="remove-staff-modal" heading="remove_staff" size="base">
          <div className="remove-staff-body">
            <p className="remove-staff-question">
              How would you like to remove &quot;{removeStaff?.name ?? "this staff member"}
              &quot;?
            </p>
            <div className="remove-options">
              <label
                className={`remove-option${removeMode === "archive" ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="removeMode"
                  value="archive"
                  checked={removeMode === "archive"}
                  onChange={() => setRemoveMode("archive")}
                />
                <span>
                  <strong>Archive (Recommended)</strong>
                  <span className="remove-option-help">
                    Preserves historical payroll and clock-in data, but removes their
                    access and frees up a staff seat.
                  </span>
                </span>
              </label>
              <label
                className={`remove-option${removeMode === "delete" ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="removeMode"
                  value="delete"
                  checked={removeMode === "delete"}
                  onChange={() => setRemoveMode("delete")}
                />
                <span>
                  <strong>Permanently Delete</strong>
                  <span className="remove-option-help">
                    Permanently erases all data associated with this staff member. This
                    cannot be undone.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <s-button
            slot="secondary-actions"
            variant="secondary"
            commandFor="remove-staff-modal"
            command="--hide"
            onClick={() => {
              setRemoveStaff(null);
              setRemoveMode("archive");
            }}
          >
            Cancel
          </s-button>
          <s-button
            slot="primary-action"
            variant="primary"
            tone={removeMode === "delete" ? "critical" : "auto"}
            loading={isBulkSubmitting}
            disabled={!removeStaff}
            onClick={submitRemoveStaff}
          >
            {removeMode === "delete" ? "Permanently Delete" : "Archive"}
          </s-button>
        </s-modal>

        <section className="staff-table-card">
          <div className="table-toolbar">
            <div className="status-tabs">
              <button
                className={`status-tab${statusFilter === "all" ? " active" : ""}`}
                type="button"
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>
              <button
                className={`status-tab${statusFilter === "active" ? " active" : ""}`}
                type="button"
                onClick={() => setStatusFilter("active")}
              >
                Active ({activeCount})
              </button>
              <button
                className={`status-tab${statusFilter === "inactive" ? " active" : ""}`}
                type="button"
                onClick={() => setStatusFilter("inactive")}
              >
                Inactive ({inactiveCount})
              </button>
              <button
                className={`status-tab${statusFilter === "missing_payment" ? " active" : ""}`}
                type="button"
                onClick={() => setStatusFilter("missing_payment")}
              >
                Missing Payment Info ({missingPaymentCount})
              </button>
              <button
                className={`status-tab${statusFilter === "archived" ? " active" : ""}`}
                type="button"
                onClick={() => setStatusFilter("archived")}
              >
                Archived ({archivedCount})
              </button>
            </div>
            <div className="table-tools">
              <label className="search-field">
                <Search aria-hidden="true" size={16} />
                <input
                  type="search"
                  placeholder="Search staff..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  aria-label="Search staff"
                />
              </label>
              <button type="button" aria-label="Filter" disabled>
                <SlidersHorizontal aria-hidden="true" size={16} />
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all staff"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Payment Method</th>
                  <th>Payroll Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${employee.firstName} ${employee.lastName}`}
                        checked={selectedIds.has(employee.id)}
                        onChange={() => toggleSelectOne(employee.id)}
                      />
                    </td>
                    <td>
                      <Link
                        className="staff-person-link"
                        to={`/app/staff/${employee.id}`}
                      >
                        <div className="staff-person">
                          <span className="avatar">
                            {initials(employee.firstName, employee.lastName)}
                          </span>
                          <span>
                            <strong>
                              {employee.firstName} {employee.lastName}
                            </strong>
                            <small>{employee.email ?? "No email"}</small>
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td>{employee.position ?? "Staff"}</td>
                    <td>{employee.location?.name ?? "Shop location"}</td>
                    <td>
                      {employee.status === "ACTIVE" ? (
                        <span className="status-badge active">Active</span>
                      ) : employee.status === "ARCHIVED" ? (
                        <span className="status-badge archived">Archived</span>
                      ) : (
                        <span className="status-badge inactive">
                          <s-icon type="info" interestFor="inactive-staff-tooltip" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="payment-badge">
                        {paymentDisplay(employee)}
                      </span>
                    </td>
                    <td>{payrollTypeLabel(employee.payrollType)}</td>
                    <td>
                      <div className="row-actions">
                        <Link
                          to={`/app/staff/${employee.id}/edit`}
                          aria-label="Edit staff"
                        >
                          <Pencil aria-hidden="true" size={15} />
                        </Link>
                        <button
                          type="button"
                          aria-label="Archive staff"
                          onClick={() => {
                            const formData = new FormData();
                            formData.set("intent", "archive");
                            formData.append("employeeIds", employee.id);
                            fetcher.submit(formData, {
                              method: "post",
                              action: "/app/staff",
                            });
                          }}
                        >
                          <Archive aria-hidden="true" size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete staff"
                          onClick={() => openRemoveStaffModal(employee)}
                        >
                          <Trash2 aria-hidden="true" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        {employees.length === 0
                          ? "No staff yet. Add your first Shopify staff member."
                          : statusFilter === "archived"
                            ? "No archived staff."
                            : "No staff match your search or filters."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </s-stack>
      <PricingModal
        pricingPlansUrl={pricingPlansUrl}
        currentPlanHandle={planHandle}
        initialStaffCount={Math.max(totalStaff, 1)}
        currentExtraStaffCount={extraStaffCount}
        atCap={atCap}
      />
      <style>{STAFF_MANAGEMENT_STYLES}</style>
    </s-page>
  );
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "ST";
}

function hasMissingPaymentInfo(employee: {
  paymentMethod: string;
  paypalEmail: string | null;
  bankName: string | null;
  accountNumber: string | null;
}) {
  if (employee.paymentMethod === "CASH" || employee.paymentMethod === "CHECK") {
    return false;
  }
  if (
    employee.paymentMethod === "BANK_TRANSFER" ||
    employee.paymentMethod === "DIRECT_DEPOSIT"
  ) {
    return !employee.bankName || !employee.accountNumber;
  }
  return !employee.paypalEmail;
}

function paymentDisplay(employee: {
  paymentMethod: string;
  paypalEmail: string | null;
  bankName: string | null;
  accountNumber: string | null;
}) {
  return hasMissingPaymentInfo(employee)
    ? "Pending"
    : paymentMethodLabel(employee.paymentMethod);
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
    REVOLUT: "Revolut",
    PAYSTACK: "Revolut",
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

const STAFF_MANAGEMENT_STYLES = `
  .plan-card,
  .bonus-banner,
  .staff-table-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .plan-card {
    align-items: center;
    display: grid;
    gap: 16px;
    grid-template-columns: auto 1fr auto;
    padding: 20px 24px;
  }

  .plan-icon {
    align-items: center;
    background: #f4f4f4;
    border: 1px solid #d4d4d4;
    border-radius: 12px;
    color: #707070;
    display: flex;
    height: 52px;
    justify-content: center;
    width: 52px;
  }

  .plan-icon svg {
    display: block;
  }

  .plan-copy,
  .staff-usage,
  .plan-action,
  .bonus-heading,
  .staff-person {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  .staff-person-link {
    color: inherit;
    text-decoration: none;
  }

  .staff-person-link:hover strong {
    color: #2c6ecb;
  }

  .plan-copy {
    align-items: flex-start;
    flex-direction: column;
  }

  .plan-chip {
    background: #dfefff;
    border-radius: 999px;
    color: #22577a;
    font-size: 12px;
    padding: 3px 8px;
  }

  .staff-usage {
    color: #303030;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .usage-bar {
    background: #d1d5db;
    border-radius: 999px;
    height: 5px;
    overflow: hidden;
    width: 120px;
  }

  .usage-bar span {
    background: #8a8f98;
    display: block;
    height: 100%;
  }

  .limit-text {
    color: #8a0000;
  }

  .plan-action {
    font-size: 13px;
  }

  .dark-button,
  .claim-button {
    border-radius: 8px;
    font-weight: 600;
    padding: 8px 14px;
    text-decoration: none;
  }

  .dark-button {
    background: #1f1f1f;
    color: #fff;
  }

  .bonus-banner {
    align-items: center;
    background:
      radial-gradient(circle at 8px 8px, rgba(255,255,255,.12) 1px, transparent 1px),
      #171717;
    background-size: 20px 20px;
    color: #fff;
    display: grid;
    gap: 16px;
    grid-template-columns: auto 1fr auto;
    padding: 24px 56px 24px 56px;
    position: relative;
  }

  .bonus-icon {
    align-items: center;
    background: #fff;
    border-radius: 999px;
    color: #111;
    display: flex;
    font-size: 24px;
    height: 52px;
    justify-content: center;
    width: 52px;
  }

  .bonus-heading span {
    background: #fff;
    border-radius: 6px;
    color: #111;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 10px;
  }

  .bonus-heading strong {
    font-size: 18px;
  }

  .bonus-banner p {
    color: #f4f4f4;
    margin: 8px 0 0;
  }

  .claim-button {
    background: #fff;
    color: #111;
    justify-self: end;
    min-width: 120px;
    text-align: center;
  }

  .banner-close {
    background: transparent;
    border: 0;
    color: #a0a0a0;
    cursor: pointer;
    font-size: 22px;
    position: absolute;
    right: 16px;
    top: 12px;
  }

  .staff-type-tabs,
  .staff-actions,
  .table-toolbar,
  .status-tabs,
  .table-tools,
  .row-actions {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  .staff-type-tabs {
    margin-top: -8px;
  }

  .tab,
  .status-tab {
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    padding: 8px 14px;
  }

  .tab.active,
  .status-tab.active {
    background: #e9e9e9;
  }

  .staff-actions {
    justify-content: flex-end;
  }

  .bulk-actions {
    align-items: center;
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
  }

  .bulk-count {
    color: #303030;
    font-size: 13px;
    font-weight: 600;
  }

  .button-with-icon {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .staff-table-card {
    overflow: hidden;
  }

  .table-toolbar {
    justify-content: space-between;
    padding: 20px 24px 12px;
  }

  .table-tools button,
  .row-actions button,
  .row-actions a {
    align-items: center;
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    min-height: 28px;
    min-width: 28px;
    text-align: center;
    text-decoration: none;
  }

  .table-tools svg,
  .row-actions svg {
    display: block;
  }

  .search-field {
    align-items: center;
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 6px;
    color: #616161;
    display: inline-flex;
    gap: 8px;
    min-height: 28px;
    padding: 0 10px;
  }

  .search-field input {
    border: 0;
    font-size: 13px;
    min-width: 180px;
    outline: none;
    padding: 4px 0;
  }

  .table-tools button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .staff-table {
    border-collapse: collapse;
    min-width: 900px;
    width: 100%;
  }

  .staff-table th,
  .staff-table td {
    border-top: 1px solid #e3e3e3;
    color: #303030;
    font-size: 13px;
    padding: 12px 16px;
    text-align: left;
    vertical-align: middle;
  }

  .staff-table th {
    background: #f7f7f7;
    color: #616161;
    font-weight: 600;
  }

  .avatar {
    align-items: center;
    background: #f04e98;
    border-radius: 8px;
    color: #fff;
    display: inline-flex;
    font-size: 12px;
    height: 32px;
    justify-content: center;
    width: 32px;
  }

  .staff-person {
    justify-content: flex-start;
  }

  .staff-person span:last-child {
    display: grid;
    gap: 2px;
  }

  .staff-person small {
    color: #616161;
  }

  .status-badge,
  .payment-badge {
    border-radius: 8px;
    display: inline-block;
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

  .status-badge.archived {
    background: #ececec;
    color: #616161;
  }

  .payment-badge {
    background: #ffe8bd;
    color: #8a5700;
  }

  .row-actions button:last-child {
    border: 0;
    color: #8a0000;
  }

  .remove-staff-body {
    display: grid;
    gap: 16px;
  }

  .remove-staff-question {
    color: #303030;
    font-size: 14px;
    margin: 0;
  }

  .remove-options {
    display: grid;
    gap: 10px;
  }

  .remove-option {
    align-items: flex-start;
    border: 1px solid #d9d9d9;
    border-radius: 10px;
    cursor: pointer;
    display: grid;
    gap: 10px;
    grid-template-columns: auto 1fr;
    padding: 12px;
  }

  .remove-option.selected {
    border-color: #1a1a1a;
    box-shadow: inset 0 0 0 1px #1a1a1a;
  }

  .remove-option input {
    accent-color: #1a1a1a;
    margin-top: 2px;
  }

  .remove-option > span {
    display: grid;
    gap: 4px;
  }

  .remove-option strong {
    color: #303030;
    font-size: 14px;
  }

  .remove-option-help {
    color: #616161;
    font-size: 13px;
    line-height: 1.4;
  }

  .empty-state {
    color: #616161;
    padding: 28px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .plan-card,
    .bonus-banner {
      grid-template-columns: 1fr;
    }

    .plan-action,
    .staff-actions,
    .table-toolbar,
    .status-tabs {
      align-items: flex-start;
      flex-direction: column;
    }

    .claim-button {
      justify-self: start;
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
