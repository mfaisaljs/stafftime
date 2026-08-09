import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useRouteError } from "react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
  UserRound,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

type SelectedProduct = {
  id: string;
  title: string;
  imageUrl: string;
  price: string;
  variantCount: number;
  commission: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const employees = await prisma.employee.findMany({
    where: { shopId: shop.id, status: { not: "ARCHIVED" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email ?? "No email on file",
    })),
  };
};

export default function CreateCommissionProgram() {
  const { employees } = useLoaderData<typeof loader>();
  const [query, setQuery] = useState("");
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(() => new Set());
  const todayKey = toDateKey(new Date());
  const [limitedTime, setLimitedTime] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState(`${todayKey}--${todayKey}`);
  const [dateRangeLabel, setDateRangeLabel] = useState("Today");
  const [calendarMonth, setCalendarMonth] = useState(() => dateFromKey(todayKey));
  const [productScope, setProductScope] = useState<"all" | "specific">("all");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [checkedProductIds, setCheckedProductIds] = useState<Set<string>>(() => new Set());
  const [bulkCommission, setBulkCommission] = useState("");
  const limitedDateRef = useRef<HTMLDivElement | null>(null);
  const dirtyInputRef = useRef<HTMLInputElement | null>(null);
  const filteredStaff = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return employees;
    return employees.filter((employee) =>
      `${employee.name} ${employee.email}`.toLowerCase().includes(normalizedQuery),
    );
  }, [employees, query]);
  const allVisibleSelected =
    filteredStaff.length > 0 &&
    filteredStaff.every((employee) => selectedStaffIds.has(employee.id));

  useEffect(() => {
    if (!dateRangeOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!limitedDateRef.current?.contains(event.target as Node)) {
        setDateRangeOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [dateRangeOpen]);

  const markDirty = () => {
    if (dirtyInputRef.current) {
      dirtyInputRef.current.value = String(Date.now());
      notifySaveBar(dirtyInputRef.current);
    }
  };

  const toggleStaff = (employeeId: string) => {
    const next = new Set(selectedStaffIds);
    if (next.has(employeeId)) {
      next.delete(employeeId);
    } else {
      next.add(employeeId);
    }
    setSelectedStaffIds(next);
    markDirty();
  };

  const toggleVisibleStaff = (checked: boolean) => {
    const next = new Set(selectedStaffIds);
    for (const employee of filteredStaff) {
      if (checked) {
        next.add(employee.id);
      } else {
        next.delete(employee.id);
      }
    }
    setSelectedStaffIds(next);
    markDirty();
  };

  const selectDatePreset = (label: string, days: number) => {
    const end = new Date();
    const start = addDays(end, -(days - 1));
    setDateRange(`${toDateKey(start)}--${toDateKey(end)}`);
    setDateRangeLabel(label);
    setCalendarMonth(start);
    markDirty();
  };

  const selectDateRange = (value: string) => {
    setDateRange(value);
    setDateRangeLabel(formatDateRange(value));
    markDirty();
  };

  const selectCalendarDay = (dateKey: string) => {
    const [start, end] = dateRange.split("--");
    if (!start || (start && end && start !== end) || dateKey < start) {
      selectDateRange(`${dateKey}--${dateKey}`);
      return;
    }
    selectDateRange(`${start}--${dateKey}`);
  };

  const openProductPicker = async () => {
    const selected = await shopifyResourcePicker({
      type: "product",
      multiple: true,
      action: "select",
      selectionIds: selectedProducts.map((product) => ({ id: product.id })),
    });
    if (!selected) return;
    const previousCommissions = new Map(
      selectedProducts.map((product) => [product.id, product.commission]),
    );
    const nextProducts = selected.map((product) => mapPickerProduct(product, previousCommissions));
    setSelectedProducts(nextProducts);
    setCheckedProductIds(new Set());
    markDirty();
  };

  const toggleProductChecked = (productId: string) => {
    const next = new Set(checkedProductIds);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    setCheckedProductIds(next);
  };

  const toggleAllProductsChecked = (checked: boolean) => {
    setCheckedProductIds(
      checked ? new Set(selectedProducts.map((product) => product.id)) : new Set(),
    );
  };

  const updateProductCommission = (productId: string, commission: string) => {
    setSelectedProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, commission } : product,
      ),
    );
    markDirty();
  };

  const applyBulkCommission = () => {
    if (!bulkCommission.trim() || checkedProductIds.size === 0) return;
    setSelectedProducts((current) =>
      current.map((product) =>
        checkedProductIds.has(product.id)
          ? { ...product, commission: bulkCommission.trim() }
          : product,
      ),
    );
    markDirty();
  };

  const handleDiscard = () => {
    setQuery("");
    setSelectedStaffIds(new Set());
    setLimitedTime(false);
    setDateRangeOpen(false);
    setDateRange(`${todayKey}--${todayKey}`);
    setDateRangeLabel("Today");
    setCalendarMonth(dateFromKey(todayKey));
    setProductScope("all");
    setSelectedProducts([]);
    setCheckedProductIds(new Set());
    setBulkCommission("");
  };

  return (
    <s-page heading="Create Commission Program">
      <Form
        method="post"
        data-save-bar
        data-discard-confirmation
        onReset={handleDiscard}
        className="commission-create-page"
      >
        <input ref={dirtyInputRef} type="hidden" name="formDirty" defaultValue="0" />
        <input type="hidden" name="dateRange" value={dateRange} />
        <input type="hidden" name="limitedTime" value={String(limitedTime)} />
        {Array.from(selectedStaffIds).map((employeeId) => (
          <input key={employeeId} type="hidden" name="employeeIds" value={employeeId} />
        ))}
        {selectedProducts.map((product) => (
          <Fragment key={product.id}>
            <input type="hidden" name="productIds" value={product.id} />
            <input type="hidden" name={`commission_${product.id}`} value={product.commission} />
          </Fragment>
        ))}

        <div className="create-layout">
          <div className="form-column">
            <section className="form-card">
              <h2>
                Program Details
                <span aria-label="Program details info">ⓘ</span>
              </h2>
              <label>
                Program Name
                <input name="programName" placeholder="Enter program name" required />
              </label>
              <p>This name will be visible to your staff members</p>
            </section>

            <section className="form-card">
              <label>
                Commission Type
                <s-select name="commissionType" value="fixed">
                  <s-option value="fixed">Fixed Amount</s-option>
                  <s-option value="percentage">Percentage</s-option>
                </s-select>
              </label>
              <p>Choose how you want to calculate the commission</p>

              <div className="checkbox-block">
                <s-checkbox
                  label="Calculate commission after discount is applied"
                  checked
                ></s-checkbox>
                <span aria-label="Discount calculation info">ⓘ</span>
              </div>
              <p className="indented-help">
                If disabled, commission will be calculated on the original price before
                discounts
              </p>

              <div className="checkbox-block">
                <s-checkbox
                  label="Limited Time Commission"
                  checked={limitedTime}
                  onChange={(event) => {
                    const checked = checkboxChecked(event);
                    setLimitedTime(checked);
                    setDateRangeOpen(false);
                    markDirty();
                  }}
                ></s-checkbox>
                <CalendarDays aria-hidden="true" size={16} />
              </div>
              {limitedTime && (
                <div className="limited-date-wrap" ref={limitedDateRef}>
                  <s-button
                    variant="secondary"
                    onClick={() => setDateRangeOpen((value) => !value)}
                  >
                    <span className="date-button-content">
                      <CalendarDays aria-hidden="true" size={15} />
                      {dateRangeLabel}
                    </span>
                  </s-button>
                  {dateRangeOpen && (
                    <div className="date-picker-panel">
                      <div className="date-presets">
                        {[
                          ["Today", 1],
                          ["Yesterday", 0],
                          ["Last 7 Days", 7],
                          ["Last 30 Days", 30],
                          ["Last 90 Days", 90],
                          ["Last 365 Days", 365],
                        ].map(([label, days]) => (
                          <button
                            key={label}
                            type="button"
                            className={dateRangeLabel === label ? "selected" : ""}
                            onClick={() => {
                              if (label === "Yesterday") {
                                const yesterday = addDays(new Date(), -1);
                                setDateRange(`${toDateKey(yesterday)}--${toDateKey(yesterday)}`);
                                setDateRangeLabel(label);
                                markDirty();
                                return;
                              }
                              selectDatePreset(String(label), Number(days));
                            }}
                          >
                            {label}
                            {dateRangeLabel === label && <span>✓</span>}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={dateRangeLabel === "Custom" ? "selected" : ""}
                          onClick={() => setDateRangeLabel("Custom")}
                        >
                          Custom
                        </button>
                      </div>
                      <div className="date-calendar">
                        <div className="date-input-row" aria-label="Selected date range">
                          <DateDisplay value={dateRange.split("--")[0] || todayKey} />
                          <span aria-hidden="true" className="date-arrow">
                            →
                          </span>
                          <DateDisplay value={dateRange.split("--")[1] || todayKey} />
                        </div>
                        <div className="dual-calendar">
                          <CalendarMonth
                            monthDate={calendarMonth}
                            rangeValue={dateRange}
                            onDayClick={selectCalendarDay}
                            previousAction={() =>
                              setCalendarMonth(addMonths(calendarMonth, -1))
                            }
                          />
                          <CalendarMonth
                            monthDate={addMonths(calendarMonth, 1)}
                            rangeValue={dateRange}
                            onDayClick={selectCalendarDay}
                            nextAction={() =>
                              setCalendarMonth(addMonths(calendarMonth, 1))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="form-card">
              <h2>Product Selection</h2>
              <label className="radio-row">
                <input
                  type="radio"
                  name="productScope"
                  value="all"
                  checked={productScope === "all"}
                  onChange={() => {
                    setProductScope("all");
                    markDirty();
                  }}
                />
                Include All Products
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="productScope"
                  value="specific"
                  checked={productScope === "specific"}
                  onChange={() => {
                    setProductScope("specific");
                    markDirty();
                  }}
                />
                Include Specific Products
              </label>

              {productScope === "all" ? (
                <>
                  <label>
                    Commission for All Products
                    <div className="money-input">
                      <span>$</span>
                      <input name="commissionValue" inputMode="decimal" />
                    </div>
                  </label>
                  <p>Set a fixed commission value in fixed amount</p>
                </>
              ) : (
                <>
                  <button
                    className="product-select-trigger"
                    type="button"
                    onClick={() => void openProductPicker()}
                  >
                    <Search aria-hidden="true" size={18} />
                    <span>Select Products</span>
                  </button>

                  {selectedProducts.length === 0 ? (
                    <div className="product-empty">
                      <div className="product-empty-illustration" aria-hidden="true">
                        <FileText size={64} />
                        <span />
                      </div>
                      <strong>No products selected</strong>
                      <p>Select specific products to set individual commission rates</p>
                      <s-button
                        variant="secondary"
                        type="button"
                        onClick={() => void openProductPicker()}
                      >
                        Select Products
                      </s-button>
                    </div>
                  ) : (
                    <div className="product-manager">
                      <div className="product-manager-header">
                        <strong>Product Details</strong>
                        <strong>Commission</strong>
                      </div>
                      <div className="product-manager-toolbar">
                        <span>
                          {checkedProductIds.size} of {selectedProducts.length} Products
                          selected
                        </span>
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => toggleAllProductsChecked(true)}
                        >
                          Select All Products
                        </button>
                      </div>

                      <div className="product-list-card">
                        <div className="product-list-heading">
                          <s-checkbox
                            checked={
                              selectedProducts.length > 0 &&
                              checkedProductIds.size === selectedProducts.length
                            }
                            indeterminate={
                              checkedProductIds.size > 0 &&
                              checkedProductIds.size < selectedProducts.length
                            }
                            onChange={(event) =>
                              toggleAllProductsChecked(checkboxChecked(event))
                            }
                          ></s-checkbox>
                          <strong>Showing {selectedProducts.length} products</strong>
                        </div>

                        {selectedProducts.map((product) => (
                          <div className="product-list-row" key={product.id}>
                            <s-checkbox
                              checked={checkedProductIds.has(product.id)}
                              onChange={() => toggleProductChecked(product.id)}
                            ></s-checkbox>
                            <div className="product-thumb" aria-hidden="true">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt="" />
                              ) : (
                                <FileText size={22} />
                              )}
                            </div>
                            <div className="product-meta">
                              <strong>{product.title}</strong>
                              <div className="product-meta-row">
                                <span>{product.price}</span>
                                <span className="variant-pill">
                                  {product.variantCount} Variant
                                  {product.variantCount === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>
                            <div className="money-input product-commission-input">
                              <span>$</span>
                              <input
                                inputMode="decimal"
                                placeholder="Enter fixed commission"
                                value={product.commission}
                                onChange={(event) =>
                                  updateProductCommission(
                                    product.id,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="bulk-update-card">
                        <strong>Bulk Update Selected Products</strong>
                        <p>Set commission for all selected products</p>
                        <div className="bulk-update-row">
                          <div className="money-input">
                            <span>$</span>
                            <input
                              inputMode="decimal"
                              value={bulkCommission}
                              onChange={(event) =>
                                setBulkCommission(event.currentTarget.value)
                              }
                            />
                          </div>
                          <s-button
                            variant="secondary"
                            type="button"
                            disabled={
                              checkedProductIds.size === 0 || !bulkCommission.trim()
                            }
                            onClick={applyBulkCommission}
                          >
                            Apply to Selected
                          </s-button>
                        </div>
                        <p>Apply fixed commission value to all selected products</p>
                        <p>
                          This will update the commission for selected products{" "}
                          {checkedProductIds.size} Products
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="staff-card">
            <label className="search-field">
              <Search aria-hidden="true" size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search staff members..."
              />
            </label>

            <div className="staff-select-all">
              <s-checkbox
                checked={allVisibleSelected}
                indeterminate={selectedStaffIds.size > 0 && !allVisibleSelected}
                onChange={(event) => toggleVisibleStaff(checkboxChecked(event))}
              ></s-checkbox>
              <strong>Showing {filteredStaff.length} staff</strong>
            </div>

            <div className="staff-list">
              {filteredStaff.map((employee) => (
                <div className="staff-row" key={employee.id}>
                  <s-checkbox
                    checked={selectedStaffIds.has(employee.id)}
                    onChange={() => toggleStaff(employee.id)}
                  ></s-checkbox>
                  <div className="staff-avatar" aria-hidden="true">
                    <UserRound size={22} />
                  </div>
                  <div>
                    <strong>{employee.name}</strong>
                    <span>{employee.email}</span>
                  </div>
                </div>
              ))}
              {filteredStaff.length === 0 && (
                <p className="empty-staff">No staff members match your search.</p>
              )}
            </div>

            <div className="staff-count">
              {selectedStaffIds.size} of {employees.length} Staff Selected
            </div>
            <div className="staff-progress">
              <span
                style={{
                  width:
                    employees.length === 0
                      ? "0%"
                      : `${Math.round((selectedStaffIds.size / employees.length) * 100)}%`,
                }}
              />
            </div>
          </aside>
        </div>
      </Form>

      <style>{CREATE_COMMISSION_STYLES}</style>
    </s-page>
  );
}

function DateDisplay({ value }: { value: string }) {
  return (
    <div className="date-display">
      <CalendarDays aria-hidden="true" size={18} />
      <span>{formatDateLabel(value)}</span>
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
  onDayClick: (dateKey: string) => void;
  previousAction?: () => void;
  nextAction?: () => void;
}) {
  const range = parseDraftRange(rangeValue);
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
        <strong>{formatMonthLabel(monthDate)}</strong>
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
      <div className="calendar-weekdays">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-days">
        {days.map((day, index) =>
          day ? (
            <button
              className={calendarDayClass(toDateKey(day), range)}
              key={toDateKey(day)}
              type="button"
              onClick={() => onDayClick(toDateKey(day))}
            >
              {day.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}

function checkboxChecked(event: { currentTarget: unknown }) {
  return Boolean((event.currentTarget as unknown as { checked: boolean }).checked);
}

function notifySaveBar(element: HTMLInputElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

type PickerProduct = {
  id: string;
  title?: string;
  images?: Array<{ originalSrc?: string; src?: string; url?: string }>;
  variants?: Array<{ id?: string; price?: string | number }>;
};

async function shopifyResourcePicker(options: {
  type: "product";
  multiple: boolean;
  action: "select";
  selectionIds: Array<{ id: string }>;
}) {
  const picker = (
    window as unknown as {
      shopify?: {
        resourcePicker?: (options: {
          type: "product";
          multiple: boolean;
          action: "select";
          selectionIds: Array<{ id: string }>;
        }) => Promise<PickerProduct[] | undefined>;
      };
    }
  ).shopify?.resourcePicker;
  if (!picker) return undefined;
  return picker(options);
}

function mapPickerProduct(
  product: PickerProduct,
  previousCommissions: Map<string, string>,
): SelectedProduct {
  const id = String(product.id);
  const image = product.images?.[0];
  const firstVariant = product.variants?.[0];
  const priceValue = firstVariant?.price;
  const price =
    priceValue === undefined || priceValue === null || priceValue === ""
      ? "$0.00"
      : `$${Number(priceValue).toFixed(2)}`;

  return {
    id,
    title: String(product.title ?? "Untitled product"),
    imageUrl: String(image?.originalSrc ?? image?.src ?? image?.url ?? ""),
    price,
    variantCount: product.variants?.length ?? 1,
    commission: previousCommissions.get(id) ?? "",
  };
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function monthGrid(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const days: Array<Date | null> = [];

  for (let index = 0; index < start.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateRange(value: string) {
  const [start, end] = value.split("--");
  if (!start || !end || start === end) return start ? formatDateLabel(start) : "Custom";
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}

function parseDraftRange(value: string) {
  const [start = "", end = ""] = value.split("--");
  return { start, end };
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

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const CREATE_COMMISSION_STYLES = `
  .commission-create-page {
    display: grid;
    gap: 26px;
  }

  .create-layout {
    align-items: start;
    display: grid;
    gap: 28px;
    grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
  }

  .form-column {
    display: grid;
    gap: 24px;
  }

  .form-card,
  .staff-card {
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    display: grid;
    gap: 14px;
    padding: 20px;
  }

  .form-card h2 {
    align-items: center;
    display: inline-flex;
    font-size: 15px;
    gap: 4px;
    margin: 0 0 4px;
  }

  .form-card label {
    color: #303030;
    display: grid;
    gap: 8px;
  }

  .form-card input,
  .search-field input,
  .money-input {
    border: 1px solid #8c9196;
    border-radius: 8px;
    font: inherit;
    min-height: 34px;
  }

  .form-card input:not([type="radio"]):not([type="checkbox"]) {
    padding-left: 12px;
  }

  .form-card > p,
  .indented-help {
    color: #616161;
    margin: 0;
  }

  .checkbox-block {
    align-items: center;
    display: flex;
    gap: 6px;
  }

  .limited-date-wrap {
    position: relative;
  }

  .date-button-content {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .date-picker-panel {
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 14px;
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.14);
    display: grid;
    gap: 18px;
    grid-template-columns: 180px max-content;
    left: 0;
    padding: 14px;
    position: absolute;
    top: calc(100% + 8px);
    width: max-content;
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
    font: inherit;
    justify-content: space-between;
    min-height: 40px;
    padding: 0 12px;
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
    padding-left: 18px;
  }

  .date-input-row {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr auto 1fr;
  }

  .date-display {
    align-items: center;
    background: #f4f4f4;
    border-radius: 10px;
    color: #616161;
    display: flex;
    gap: 8px;
    min-height: 42px;
    padding: 0 12px;
  }

  .date-arrow {
    color: #8a8a8a;
    font-size: 22px;
    line-height: 1;
  }

  .dual-calendar {
    display: grid;
    gap: 22px;
    grid-template-columns: repeat(2, 240px);
  }

  .calendar-month {
    display: grid;
    gap: 12px;
  }

  .calendar-heading {
    align-items: center;
    color: #303030;
    display: grid;
    font-size: 15px;
    grid-template-columns: 32px 1fr 32px;
    min-height: 32px;
    text-align: center;
  }

  .month-nav {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: #616161;
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
    padding: 0 0 8px;
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
    min-height: 34px;
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
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px #303030;
  }

  .indented-help {
    margin-left: 30px;
  }

  .radio-row {
    align-items: center;
    display: flex !important;
    gap: 10px !important;
  }

  .radio-row input {
    accent-color: #000;
    min-height: auto;
  }

  .product-select-trigger {
    align-items: center;
    background: #fff;
    border: 1px solid #8c9196;
    border-radius: 8px;
    color: #616161;
    cursor: pointer;
    display: flex;
    font: inherit;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    text-align: left;
    width: 100%;
  }

  .product-empty {
    align-items: center;
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 28px 12px 12px;
    text-align: center;
  }

  .product-empty p {
    color: #616161;
    margin: 0 0 6px;
  }

  .product-empty-illustration {
    color: #d8d8d8;
    display: grid;
    margin-bottom: 6px;
    place-items: center;
    position: relative;
  }

  .product-empty-illustration span {
    background: #f5b63b;
    border-radius: 2px;
    height: 18px;
    left: 18px;
    position: absolute;
    top: 12px;
    width: 18px;
  }

  .product-manager {
    display: grid;
    gap: 14px;
  }

  .product-manager-header {
    display: grid;
    font-size: 13px;
    grid-template-columns: 1fr 180px;
    padding: 0 4px;
  }

  .product-manager-header strong:last-child {
    text-align: right;
  }

  .product-manager-toolbar {
    align-items: center;
    color: #616161;
    display: flex;
    justify-content: space-between;
  }

  .text-action {
    background: transparent;
    border: 0;
    color: #303030;
    cursor: pointer;
    font: inherit;
    font-weight: 650;
    text-decoration: underline;
  }

  .product-list-card,
  .bulk-update-card {
    border: 1px solid #e3e3e3;
    border-radius: 10px;
    display: grid;
    gap: 0;
    overflow: hidden;
  }

  .product-list-heading {
    align-items: center;
    border-bottom: 1px solid #ececec;
    display: flex;
    gap: 10px;
    padding: 12px 14px;
  }

  .product-list-row {
    align-items: center;
    border-bottom: 1px solid #ececec;
    display: grid;
    gap: 12px;
    grid-template-columns: auto 42px 1fr 180px;
    padding: 12px 14px;
  }

  .product-list-row:last-child {
    border-bottom: 0;
  }

  .product-thumb {
    align-items: center;
    background: #f4f4f4;
    border: 1px solid #e3e3e3;
    border-radius: 8px;
    color: #b5b5b5;
    display: inline-flex;
    height: 42px;
    justify-content: center;
    overflow: hidden;
    width: 42px;
  }

  .product-thumb img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .product-meta {
    display: grid;
    gap: 4px;
  }

  .product-meta-row {
    align-items: center;
    color: #616161;
    display: flex;
    gap: 8px;
  }

  .variant-pill {
    background: #efefef;
    border-radius: 999px;
    color: #616161;
    font-size: 12px;
    padding: 2px 8px;
  }

  .product-commission-input {
    width: 180px;
  }

  .bulk-update-card {
    gap: 8px;
    padding: 16px;
  }

  .bulk-update-card p {
    color: #616161;
    margin: 0;
  }

  .bulk-update-row {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr auto;
  }

  .money-input {
    align-items: center;
    display: flex;
    overflow: hidden;
  }

  .money-input span {
    padding-left: 14px;
  }

  .money-input input {
    border: 0;
    flex: 1;
    min-height: 32px;
    outline: 0;
    padding-left: 8px;
  }

  .search-field {
    align-items: center;
    border: 1px solid #8c9196;
    border-radius: 8px;
    display: flex;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
  }

  .search-field input {
    border: 0;
    flex: 1;
    min-height: auto;
    outline: 0;
  }

  .staff-select-all {
    align-items: center;
    border-bottom: 1px solid #e5e5e5;
    display: flex;
    gap: 10px;
    padding: 10px 0 16px;
  }

  .staff-list {
    display: grid;
    gap: 10px;
    min-height: 82px;
  }

  .staff-row {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: auto auto 1fr;
  }

  .staff-avatar {
    align-items: center;
    background: #bd2ccf;
    border-radius: 6px;
    color: #fff;
    display: inline-flex;
    height: 34px;
    justify-content: center;
    width: 34px;
  }

  .staff-row strong {
    display: block;
  }

  .staff-row span,
  .empty-staff {
    color: #616161;
  }

  .staff-count {
    color: #616161;
    font-weight: 650;
    text-align: center;
  }

  .staff-progress {
    background: #e3e3e3;
    border-radius: 999px;
    height: 8px;
    overflow: hidden;
  }

  .staff-progress span {
    background: #303030;
    display: block;
    height: 100%;
  }

  @media (max-width: 860px) {
    .create-layout {
      grid-template-columns: 1fr;
    }
  }
`;
