import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployeeLocations, getEmployees } from "../services/admin.server";
import prisma from "../db.server";

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function currentYearMonth(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function lastSixYearMonths(from = new Date(), notBefore?: Date | null) {
  const floor = notBefore
    ? new Date(notBefore.getFullYear(), notBefore.getMonth(), 1)
    : null;

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(from.getFullYear(), from.getMonth() - index, 1);
    return date;
  })
    .filter((date) => !floor || date.getTime() >= floor.getTime())
    .map((date) => currentYearMonth(date));
}

function formatMonthLabel(yearMonth: string, isCurrent: boolean) {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(year, (month ?? 1) - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
  return isCurrent ? `${label} (current)` : label;
}

async function upsertTargetGoalSnapshots(options: {
  shopId: string;
  employeeIds: string[];
  yearMonth: string;
  amount: number;
  currency: string;
}) {
  const { shopId, employeeIds, yearMonth, amount, currency } = options;
  await Promise.all(
    employeeIds.map((employeeId) =>
      prisma.salesTargetSnapshot.upsert({
        where: {
          shopId_employeeId_yearMonth: { shopId, employeeId, yearMonth },
        },
        create: {
          shopId,
          employeeId,
          yearMonth,
          amount,
          currency,
          soldAmount: 0,
        },
        update: {
          amount,
          currency,
        },
      }),
    ),
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const shopHandle = session.shop.replace(/\.myshopify\.com$/i, "");
  const posEditorUrl = `https://admin.shopify.com/store/${shopHandle}/apps/point-of-sale-channel/editor`;

  const [employees, locations, targets] = await Promise.all([
    getEmployees(session),
    getEmployeeLocations(session),
    prisma.salesTarget.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const yearMonth = currentYearMonth();

  // Keep current-month goal snapshots in sync with active targets.
  await Promise.all(
    targets.flatMap((target) =>
      parseIds(target.employeeIds).map((employeeId) =>
        prisma.salesTargetSnapshot.upsert({
          where: {
            shopId_employeeId_yearMonth: {
              shopId: shop.id,
              employeeId,
              yearMonth,
            },
          },
          create: {
            shopId: shop.id,
            employeeId,
            yearMonth,
            amount: target.amount,
            currency: target.currency,
            soldAmount: 0,
          },
          update: {
            amount: target.amount,
            currency: target.currency,
          },
        }),
      ),
    ),
  );

  const employeeIdsInTargets = Array.from(
    new Set(targets.flatMap((target) => parseIds(target.employeeIds))),
  );
  const historyMonthCandidates = lastSixYearMonths();
  const snapshots = employeeIdsInTargets.length
    ? await prisma.salesTargetSnapshot.findMany({
        where: {
          shopId: shop.id,
          employeeId: { in: employeeIdsInTargets },
          yearMonth: { in: historyMonthCandidates },
        },
      })
    : [];

  const snapshotByEmployeeMonth = new Map(
    snapshots.map((snapshot) => [
      `${snapshot.employeeId}:${snapshot.yearMonth}`,
      snapshot,
    ]),
  );

  const employeeNameById = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`.trim(),
    ]),
  );
  const employeeActivationById = new Map(
    employees.map((employee) => [
      employee.id,
      employee.firstLoginAt ?? employee.createdAt,
    ]),
  );
  const locationNameById = new Map(
    locations.map((location) => [location.id, location.name]),
  );
  const activeLocationCount = locations.length;

  const targetRows = targets.flatMap((target) => {
    const employeeIds = parseIds(target.employeeIds);
    const locationIds = parseIds(target.locationIds);
    const locationLabel =
      locationIds.length === 0 ||
      (activeLocationCount > 0 && locationIds.length >= activeLocationCount) ||
      locationIds.length > 1
        ? "All locations"
        : (locationNameById.get(locationIds[0]) ?? "All locations");

    return employeeIds.map((employeeId) => {
      const currentSnapshot = snapshotByEmployeeMonth.get(
        `${employeeId}:${yearMonth}`,
      );
      const sold = currentSnapshot?.soldAmount ?? 0;
      const goalAmount = currentSnapshot?.amount ?? target.amount;
      const remaining = Math.max(0, goalAmount - sold);
      const progressPercent =
        goalAmount > 0
          ? Math.min(100, Math.round((sold / goalAmount) * 100))
          : 0;
      const status =
        progressPercent >= 100
          ? "Met"
          : progressPercent >= 50
            ? "On track"
            : "Behind";

      const historyMonths = lastSixYearMonths(
        new Date(),
        employeeActivationById.get(employeeId) ?? null,
      );

      const history = historyMonths.map((monthKey, index) => {
        const snapshot = snapshotByEmployeeMonth.get(`${employeeId}:${monthKey}`);
        // Prefer snapshotted goal for that month; fall back to current target amount.
        const monthGoal = snapshot?.amount ?? target.amount;
        const monthSold = snapshot?.soldAmount ?? 0;
        const monthProgress =
          monthGoal > 0
            ? Math.min(100, Math.round((monthSold / monthGoal) * 100))
            : 0;
        return {
          yearMonth: monthKey,
          label: formatMonthLabel(monthKey, index === 0),
          isCurrent: index === 0,
          sold: monthSold,
          amount: monthGoal,
          currency: snapshot?.currency ?? target.currency,
          progressPercent: monthProgress,
        };
      });

      return {
        id: `${target.id}:${employeeId}`,
        targetId: target.id,
        employeeId,
        staffName: employeeNameById.get(employeeId) ?? "Unknown staff",
        locationLabel,
        amount: goalAmount,
        currency: target.currency,
        sold,
        remaining,
        progressPercent,
        status,
        employeeIds,
        locationIds,
        history,
      };
    });
  });

  return {
    posEditorUrl,
    appName: "Trubuild: Staff Management",
    employees: employees
      .filter((employee) => employee.status !== "ARCHIVED")
      .map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
      })),
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
    })),
    targetRows,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "deleteTarget") {
    const targetId = String(formData.get("targetId") || "");
    const employeeId = String(formData.get("employeeId") || "");
    if (!targetId) return { ok: false, error: "Target not found." };

    const existing = await prisma.salesTarget.findFirst({
      where: { id: targetId, shopId: shop.id },
    });
    if (!existing) return { ok: false, error: "Target not found." };

    const employeeIds = parseIds(existing.employeeIds).filter((id) => id !== employeeId);
    if (employeeIds.length === 0) {
      await prisma.salesTarget.delete({ where: { id: targetId } });
    } else {
      await prisma.salesTarget.update({
        where: { id: targetId },
        data: { employeeIds: JSON.stringify(employeeIds) },
      });
    }
    return { ok: true };
  }

  if (intent !== "createTarget" && intent !== "updateTarget") {
    return { ok: false, error: "Unknown action." };
  }

  const employeeIds = formData.getAll("employeeIds").map(String).filter(Boolean);
  const locationIds = formData.getAll("locationIds").map(String).filter(Boolean);
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountRaw);
  const targetId = String(formData.get("targetId") || "");

  if (employeeIds.length === 0) {
    return { ok: false, error: "Select at least one staff member." };
  }
  if (locationIds.length === 0) {
    return { ok: false, error: "Select at least one location." };
  }
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid monthly target amount." };
  }

  if (intent === "updateTarget") {
    if (!targetId) return { ok: false, error: "Target not found." };
    if (employeeIds.length !== 1) {
      return { ok: false, error: "When editing, select exactly one staff member." };
    }

    const existing = await prisma.salesTarget.findFirst({
      where: { id: targetId, shopId: shop.id },
    });
    if (!existing) return { ok: false, error: "Target not found." };

    const nextEmployeeId = employeeIds[0];

    // Edit updates this row only — never create additional staff target entries.
    await prisma.salesTarget.update({
      where: { id: targetId },
      data: {
        amount,
        employeeIds: JSON.stringify([nextEmployeeId]),
        locationIds: JSON.stringify(locationIds),
      },
    });

    await upsertTargetGoalSnapshots({
      shopId: shop.id,
      employeeIds: [nextEmployeeId],
      yearMonth: existing.yearMonth || currentYearMonth(),
      amount,
      currency: existing.currency,
    });

    return { ok: true };
  }

  const yearMonth = currentYearMonth();

  // One row per staff member in the list view.
  await prisma.salesTarget.createMany({
    data: employeeIds.map((employeeId) => ({
      shopId: shop.id,
      yearMonth,
      amount,
      currency: "USD",
      employeeIds: JSON.stringify([employeeId]),
      locationIds: JSON.stringify(locationIds),
    })),
  });

  await upsertTargetGoalSnapshots({
    shopId: shop.id,
    employeeIds,
    yearMonth,
    amount,
    currency: "USD",
  });

  return { ok: true };
};

function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

export default function SalesTargetsIndex() {
  const { targetRows, posEditorUrl, appName, employees, locations } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [historyRow, setHistoryRow] = useState<(typeof targetRows)[number] | null>(
    null,
  );

  const saving = fetcher.state !== "idle";
  const saveDisabled =
    selectedStaffIds.size === 0 ||
    selectedLocationIds.size === 0 ||
    !amount.trim() ||
    saving;
  const isEditing = Boolean(editingTargetId);

  const resetTargetForm = () => {
    setSelectedStaffIds(new Set());
    setSelectedLocationIds(new Set());
    setAmount("");
    setFormError("");
    setEditingTargetId(null);
  };

  const openCreateModal = () => {
    resetTargetForm();
    const modal = document.getElementById("set-sales-target-modal") as
      | (HTMLElement & { showOverlay?: () => void })
      | null;
    modal?.showOverlay?.();
  };

  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      setFormError(fetcher.data.error);
    }
    if (fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      resetTargetForm();
      const modal = document.getElementById("set-sales-target-modal") as
        | (HTMLElement & { hideOverlay?: () => void })
        | null;
      modal?.hideOverlay?.();
    }
  }, [fetcher.data]);

  const allStaffSelected = useMemo(
    () =>
      employees.length > 0 &&
      employees.every((employee) => selectedStaffIds.has(employee.id)),
    [employees, selectedStaffIds],
  );
  const allLocationsSelected = useMemo(
    () =>
      locations.length > 0 &&
      locations.every((location) => selectedLocationIds.has(location.id)),
    [locations, selectedLocationIds],
  );

  const toggleStaff = (id: string, checked: boolean) => {
    setSelectedStaffIds((current) => {
      // Edit mode is single-staff: picking someone replaces the selection.
      if (isEditing) {
        return checked ? new Set([id]) : new Set();
      }
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleLocation = (id: string, checked: boolean) => {
    setSelectedLocationIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllStaff = () => {
    setSelectedStaffIds(new Set(employees.map((employee) => employee.id)));
  };

  const selectAllLocations = () => {
    setSelectedLocationIds(new Set(locations.map((location) => location.id)));
  };

  const submitTarget = () => {
    if (selectedStaffIds.size === 0) {
      setFormError("Select at least one staff member.");
      return;
    }
    if (isEditing && selectedStaffIds.size !== 1) {
      setFormError("When editing, select exactly one staff member.");
      return;
    }
    if (selectedLocationIds.size === 0) {
      setFormError("Select at least one location.");
      return;
    }
    if (!amount.trim() || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("Enter a valid monthly target amount.");
      return;
    }

    setFormError("");
    const formData = new FormData();
    formData.set("intent", isEditing ? "updateTarget" : "createTarget");
    if (editingTargetId) formData.set("targetId", editingTargetId);
    formData.set("amount", amount.trim());
    for (const id of selectedStaffIds) formData.append("employeeIds", id);
    for (const id of selectedLocationIds) formData.append("locationIds", id);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Sales Targets" inlineSize="large">
      <div className="sales-targets-page">
        {targetRows.length > 0 && (
          <div className="targets-toolbar">
            <s-button variant="primary" onClick={openCreateModal}>
              Set target
            </s-button>
          </div>
        )}

        {!bannerDismissed && (
          <div className="sales-targets-banner">
            <div className="banner-title">
              <span aria-hidden="true">ⓘ</span>
              <strong>Set up Sales Targets on your POS</strong>
              <button
                type="button"
                aria-label="Dismiss banner"
                onClick={() => setBannerDismissed(true)}
              >
                ×
              </button>
            </div>
            <div className="banner-body">
              <p>
                <strong>1) Add the Sales Targets tile</strong>
                <br />
                In the POS editor, tap Add tile → {appName} → Sales Targets, then
                save. Staff can tap the tile and enter their PIN to see monthly
                progress.
              </p>
              <p>
                <strong>2) Turn on the extension</strong>
                <br />
                In the POS editor, open Apps, find Sales Targets, and turn it on.
                This adds it to Order details and Post-purchase so staff can
                attribute sales to themselves.
              </p>
              <p className="banner-note">
                Don&apos;t see it? Make sure the latest app version is released and
                turn off any active dev preview, then reopen POS.
              </p>
              <div className="banner-action">
                <s-button variant="secondary" href={posEditorUrl} target="_blank">
                  Open POS editor
                </s-button>
              </div>
            </div>
          </div>
        )}

        {targetRows.length === 0 ? (
          <section className="empty-card">
            <strong>No sales targets yet</strong>
            <p>
              Create a monthly target for a staff member at a location to start
              tracking progress. Sales are credited when a sale is assigned to the
              staff member at POS.
            </p>
            <div className="empty-action">
              <s-button variant="primary" onClick={openCreateModal}>
                Set target
              </s-button>
            </div>
          </section>
        ) : (
          <>
            <section className="targets-card">
              <div className="targets-table-wrap">
                <table className="targets-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Location</th>
                      <th>Target</th>
                      <th>Sold (this month)</th>
                      <th>Progress</th>
                      <th>Remaining</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.staffName}</td>
                        <td>{row.locationLabel}</td>
                        <td>{formatMoney(row.currency, row.amount)}</td>
                        <td>{formatMoney(row.currency, row.sold)}</td>
                        <td>
                          <div className="progress-cell">
                            <span>{row.progressPercent}%</span>
                            <div
                              className="progress-bar"
                              aria-label={`${row.progressPercent}% complete`}
                            >
                              <span style={{ width: `${row.progressPercent}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>{formatMoney(row.currency, row.remaining)}</td>
                        <td>
                          <span
                            className={`status-pill status-${row.status
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="action-link"
                              onClick={() => {
                                setEditingTargetId(row.targetId);
                                setSelectedStaffIds(new Set([row.employeeId]));
                                setSelectedLocationIds(new Set(row.locationIds));
                                setAmount(String(row.amount));
                                setFormError("");
                                const modal = document.getElementById(
                                  "set-sales-target-modal",
                                ) as (HTMLElement & { showOverlay?: () => void }) | null;
                                modal?.showOverlay?.();
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="action-link"
                              onClick={() => {
                                setHistoryRow(row);
                                const modal = document.getElementById(
                                  "sales-target-history-modal",
                                ) as (HTMLElement & { showOverlay?: () => void }) | null;
                                modal?.showOverlay?.();
                              }}
                            >
                              History
                            </button>
                            <fetcher.Form method="post" className="inline-form">
                              <input type="hidden" name="intent" value="deleteTarget" />
                              <input type="hidden" name="targetId" value={row.targetId} />
                              <input
                                type="hidden"
                                name="employeeId"
                                value={row.employeeId}
                              />
                              <button type="submit" className="action-link danger">
                                Delete
                              </button>
                            </fetcher.Form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      <s-modal
        id="set-sales-target-modal"
        heading={isEditing ? "Edit monthly sales target" : "Set monthly sales target"}
        size="base"
      >
        <div className="target-modal-body">
          {formError && <p className="target-form-error">{formError}</p>}

          <div className="target-section">
            <div className="target-section-header">
              <strong>Staff members</strong>
              {!isEditing ? (
                <button
                  type="button"
                  className="select-all-link"
                  onClick={selectAllStaff}
                  disabled={employees.length === 0 || allStaffSelected}
                >
                  Select all
                </button>
              ) : null}
            </div>
            <div className="selection-box">
              {employees.length === 0 ? (
                <p className="selection-empty">No staff members available.</p>
              ) : (
                employees.map((employee) => {
                  const checked = selectedStaffIds.has(employee.id);
                  return (
                    <div
                      className="selection-row"
                      key={employee.id}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => toggleStaff(employee.id, !checked)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleStaff(employee.id, !checked);
                        }
                      }}
                    >
                      <s-checkbox checked={checked}></s-checkbox>
                      <span>{employee.name}</span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="selection-count">{selectedStaffIds.size} selected</p>
          </div>

          <div className="target-section">
            <div className="target-section-header">
              <strong>Locations</strong>
              <button
                type="button"
                className="select-all-link"
                onClick={selectAllLocations}
                disabled={locations.length === 0 || allLocationsSelected}
              >
                Select all
              </button>
            </div>
            <div className="selection-box">
              {locations.length === 0 ? (
                <p className="selection-empty">No locations available.</p>
              ) : (
                locations.map((location) => {
                  const checked = selectedLocationIds.has(location.id);
                  return (
                    <div
                      className="selection-row"
                      key={location.id}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => toggleLocation(location.id, !checked)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleLocation(location.id, !checked);
                        }
                      }}
                    >
                      <s-checkbox checked={checked}></s-checkbox>
                      <span>{location.name}</span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="selection-count">{selectedLocationIds.size} selected</p>
          </div>

          <div className="target-section">
            <label className="amount-field">
              <strong>Monthly target (USD)</strong>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
              />
            </label>
          </div>
        </div>

        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="set-sales-target-modal"
          command="--hide"
          onClick={resetTargetForm}
        >
          Cancel
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={saveDisabled}
          onClick={submitTarget}
        >
          {saving ? "Saving..." : isEditing ? "Update" : "Save"}
        </s-button>
      </s-modal>

      <s-modal
        id="sales-target-history-modal"
        heading={
          historyRow
            ? `Monthly history — ${historyRow.staffName}`
            : "Monthly history"
        }
        size="base"
      >
        {historyRow && (
          <div className="history-modal-body">
            <p className="history-intro">
              Sold each month vs the monthly target goal snapshot (
              {formatMoney(historyRow.currency, historyRow.amount)}). History only
              includes months on or after this staff member&apos;s activation date.
            </p>
            <div className="history-list">
              {historyRow.history.length === 0 ? (
                <p className="history-empty">
                  No monthly history yet for this staff member.
                </p>
              ) : (
                historyRow.history.map((month) => (
                  <div className="history-row" key={month.yearMonth}>
                    <strong className={month.isCurrent ? "is-current" : undefined}>
                      {month.label}
                    </strong>
                    <div className="history-metrics">
                      <span>
                        {formatMoney(month.currency, month.sold)} /{" "}
                        {formatMoney(month.currency, month.amount)}
                      </span>
                      <span
                        className={`history-pill${
                          month.progressPercent >= 100
                            ? " is-met"
                            : month.progressPercent >= 50
                              ? " is-track"
                              : ""
                        }`}
                      >
                        {month.progressPercent}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="sales-target-history-modal"
          command="--hide"
          onClick={() => setHistoryRow(null)}
        >
          Close
        </s-button>
      </s-modal>

      <style>{SALES_TARGETS_STYLES}</style>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const SALES_TARGETS_STYLES = `
  .sales-targets-page {
    display: grid;
    gap: 22px;
  }

  .sales-targets-banner {
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }

  .banner-title {
    align-items: center;
    background: #8ed0fb;
    display: flex;
    gap: 8px;
    padding: 9px 12px;
  }

  .banner-title button {
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 18px;
    margin-left: auto;
  }

  .banner-body {
    display: grid;
    gap: 14px;
    padding: 16px 14px 14px;
  }

  .banner-body p {
    color: #303030;
    line-height: 1.45;
    margin: 0;
  }

  .banner-note {
    color: #616161 !important;
    font-size: 13px;
  }

  .banner-action {
    padding-top: 2px;
  }

  .empty-card,
  .targets-card {
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
  }

  .empty-card {
    align-items: center;
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 40px 32px;
    text-align: center;
  }

  .empty-card strong {
    font-size: 16px;
  }

  .empty-card p {
    color: #616161;
    line-height: 1.45;
    margin: 0;
    max-width: 520px;
  }

  .empty-card s-button,
  .empty-card .empty-action {
    margin-top: 4px;
  }

  .targets-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .targets-card {
    overflow: hidden;
  }

  .targets-table-wrap {
    overflow-x: auto;
  }

  .targets-table {
    border-collapse: collapse;
    min-width: 960px;
    width: 100%;
  }

  .targets-table th,
  .targets-table td {
    border-bottom: 1px solid #ececec;
    color: #303030;
    font-size: 13px;
    padding: 12px 14px;
    text-align: left;
    vertical-align: middle;
  }

  .targets-table th {
    background: #f6f6f7;
    color: #616161;
    font-weight: 600;
  }

  .targets-table tr:last-child td {
    border-bottom: 0;
  }

  .progress-cell {
    align-items: center;
    display: flex;
    gap: 10px;
    min-width: 140px;
  }

  .progress-cell span {
    flex-shrink: 0;
    min-width: 28px;
  }

  .progress-bar {
    background: #e4e5e7;
    border-radius: 999px;
    height: 8px;
    overflow: hidden;
    width: 100%;
  }

  .progress-bar > span {
    background: #008060;
    display: block;
    height: 100%;
    min-width: 0;
  }

  .status-pill {
    border-radius: 999px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 10px;
  }

  .status-behind {
    background: #ffea8a;
    color: #5c4400;
  }

  .status-on-track {
    background: #e0f0ff;
    color: #00527c;
  }

  .status-met {
    background: #cdfee1;
    color: #0c5132;
  }

  .row-actions {
    align-items: center;
    display: flex;
    gap: 12px;
    white-space: nowrap;
  }

  .inline-form {
    display: inline;
    margin: 0;
  }

  .action-link {
    background: transparent;
    border: 0;
    color: #2c6ecb;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }

  .action-link:disabled {
    color: #8c9196;
    cursor: default;
  }

  .action-link.danger {
    color: #d72c0d;
  }

  .history-modal-body {
    display: grid;
    gap: 14px;
  }

  .history-intro {
    color: #616161;
    font-size: 13px;
    line-height: 1.45;
    margin: 0;
  }

  .history-list {
    border: 1px solid #e3e3e3;
    border-radius: 8px;
    overflow: hidden;
  }

  .history-empty {
    color: #616161;
    font-size: 13px;
    margin: 0;
    padding: 16px 14px;
  }

  .history-row {
    align-items: center;
    border-bottom: 1px solid #ececec;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .history-row:last-child {
    border-bottom: 0;
  }

  .history-row strong {
    font-weight: 500;
  }

  .history-row strong.is-current {
    font-weight: 700;
  }

  .history-metrics {
    align-items: center;
    display: flex;
    gap: 10px;
    white-space: nowrap;
  }

  .history-pill {
    background: #ffea8a;
    border-radius: 999px;
    color: #5c4400;
    font-size: 12px;
    font-weight: 650;
    padding: 2px 8px;
  }

  .history-pill.is-track {
    background: #e0f0ff;
    color: #00527c;
  }

  .history-pill.is-met {
    background: #cdfee1;
    color: #0c5132;
  }

  .target-modal-body {
    display: grid;
    gap: 18px;
  }

  .target-section {
    display: grid;
    gap: 8px;
  }

  .target-section-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .select-all-link {
    background: transparent;
    border: 0;
    color: #2c6ecb;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
  }

  .select-all-link:disabled {
    color: #8c9196;
    cursor: default;
  }

  .selection-box {
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    max-height: 180px;
    overflow: auto;
  }

  .selection-row {
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    display: flex;
    gap: 10px;
    padding: 10px 12px;
  }

  .selection-row s-checkbox {
    pointer-events: none;
  }

  .selection-row:last-child {
    border-bottom: 0;
  }

  .selection-empty,
  .selection-count {
    color: #616161;
    font-size: 13px;
    margin: 0;
  }

  .selection-empty {
    padding: 14px 12px;
  }

  .amount-field {
    display: grid;
    gap: 8px;
    max-width: 220px;
  }

  .amount-field input {
    border: 1px solid #c9cccf;
    border-radius: 8px;
    box-sizing: border-box;
    font-size: 13px;
    min-height: 34px;
    padding: 6px 10px 6px 12px;
    width: 100%;
  }

  .target-form-error {
    background: #fff4f4;
    border: 1px solid #f4b4b4;
    border-radius: 8px;
    color: #8a1f1f;
    font-size: 13px;
    margin: 0;
    padding: 10px 12px;
  }
`;
