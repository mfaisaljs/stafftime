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

function currentYearMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function checkboxChecked(event: { currentTarget: unknown }) {
  return Boolean((event.currentTarget as unknown as { checked: boolean }).checked);
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
    targets: targets.map((target) => ({
      id: target.id,
      yearMonth: target.yearMonth,
      amount: target.amount,
      currency: target.currency,
      employeeCount: parseIds(target.employeeIds).length,
      locationCount: parseIds(target.locationIds).length,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "createTarget") {
    return { ok: false, error: "Unknown action." };
  }

  const employeeIds = formData.getAll("employeeIds").map(String).filter(Boolean);
  const locationIds = formData.getAll("locationIds").map(String).filter(Boolean);
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountRaw);

  if (employeeIds.length === 0) {
    return { ok: false, error: "Select at least one staff member." };
  }
  if (locationIds.length === 0) {
    return { ok: false, error: "Select at least one location." };
  }
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid monthly target amount." };
  }

  await prisma.salesTarget.create({
    data: {
      shopId: shop.id,
      yearMonth: currentYearMonth(),
      amount,
      currency: "USD",
      employeeIds: JSON.stringify(employeeIds),
      locationIds: JSON.stringify(locationIds),
    },
  });

  return { ok: true };
};

export default function SalesTargetsIndex() {
  const { targets, posEditorUrl, appName, employees, locations } =
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

  const saving = fetcher.state !== "idle";
  const saveDisabled =
    selectedStaffIds.size === 0 ||
    selectedLocationIds.size === 0 ||
    !amount.trim() ||
    saving;

  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      setFormError(fetcher.data.error);
    }
    if (fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setSelectedStaffIds(new Set());
      setSelectedLocationIds(new Set());
      setAmount("");
      setFormError("");
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
    formData.set("intent", "createTarget");
    formData.set("amount", amount.trim());
    for (const id of selectedStaffIds) formData.append("employeeIds", id);
    for (const id of selectedLocationIds) formData.append("locationIds", id);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Sales Targets" inlineSize="large">
      <div className="sales-targets-page">
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

        {targets.length === 0 ? (
          <section className="empty-card">
            <strong>No sales targets yet</strong>
            <p>
              Create a monthly target for a staff member at a location to start
              tracking progress. Sales are credited when a sale is assigned to the
              staff member at POS.
            </p>
            <s-button
              variant="primary"
              commandFor="set-sales-target-modal"
              command="--show"
            >
              Set target
            </s-button>
          </section>
        ) : (
          <section className="targets-card">
            <div className="targets-header">
              <strong>Sales targets</strong>
              <s-button
                variant="primary"
                commandFor="set-sales-target-modal"
                command="--show"
              >
                Set target
              </s-button>
            </div>
            <div className="targets-list">
              {targets.map((target) => (
                <div className="target-row" key={target.id}>
                  <div>
                    <strong>
                      {target.currency} {target.amount.toFixed(2)}
                    </strong>
                    <span>
                      {target.yearMonth} · {target.employeeCount} staff ·{" "}
                      {target.locationCount} location
                      {target.locationCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <s-modal id="set-sales-target-modal" heading="Set monthly sales target" size="large">
        <div className="target-modal-body">
          {formError && <p className="target-form-error">{formError}</p>}

          <div className="target-section">
            <div className="target-section-header">
              <strong>Staff members</strong>
              <button
                type="button"
                className="select-all-link"
                onClick={selectAllStaff}
                disabled={employees.length === 0 || allStaffSelected}
              >
                Select all
              </button>
            </div>
            <div className="selection-box">
              {employees.length === 0 ? (
                <p className="selection-empty">No staff members available.</p>
              ) : (
                employees.map((employee) => (
                  <label className="selection-row" key={employee.id}>
                    <s-checkbox
                      checked={selectedStaffIds.has(employee.id)}
                      onChange={(event) =>
                        toggleStaff(employee.id, checkboxChecked(event))
                      }
                    ></s-checkbox>
                    <span>{employee.name}</span>
                  </label>
                ))
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
                locations.map((location) => (
                  <label className="selection-row" key={location.id}>
                    <s-checkbox
                      checked={selectedLocationIds.has(location.id)}
                      onChange={(event) =>
                        toggleLocation(location.id, checkboxChecked(event))
                      }
                    ></s-checkbox>
                    <span>{location.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="selection-count">{selectedLocationIds.size} selected</p>
          </div>

          <div className="target-section">
            <label className="amount-field">
              <strong>Monthly target (USD)</strong>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                placeholder=""
              />
            </label>
          </div>
        </div>

        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="set-sales-target-modal"
          command="--hide"
        >
          Cancel
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={saveDisabled}
          onClick={submitTarget}
        >
          {saving ? "Saving..." : "Save"}
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
    gap: 10px;
    justify-items: center;
    min-height: 280px;
    padding: 48px 32px;
    text-align: center;
  }

  .empty-card strong {
    font-size: 16px;
  }

  .empty-card p {
    color: #616161;
    line-height: 1.45;
    margin: 0 0 8px;
    max-width: 520px;
  }

  .targets-header {
    align-items: center;
    border-bottom: 1px solid #ececec;
    display: flex;
    justify-content: space-between;
    padding: 14px 16px;
  }

  .target-row {
    border-bottom: 1px solid #ececec;
    padding: 14px 16px;
  }

  .target-row:last-child {
    border-bottom: 0;
  }

  .target-row strong,
  .target-row span {
    display: block;
  }

  .target-row span {
    color: #616161;
    margin-top: 4px;
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
  }

  .amount-field input {
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    font-size: 14px;
    min-height: 40px;
    padding: 8px 12px;
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
