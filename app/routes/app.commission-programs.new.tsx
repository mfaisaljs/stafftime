import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useRouteError } from "react-router";
import { useMemo, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ArrowLeft, CalendarDays, Search, UserRound } from "lucide-react";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

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

  const toggleStaff = (employeeId: string) => {
    const next = new Set(selectedStaffIds);
    if (next.has(employeeId)) {
      next.delete(employeeId);
    } else {
      next.add(employeeId);
    }
    setSelectedStaffIds(next);
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
  };

  return (
    <s-page inlineSize="large">
      <div className="commission-create-page">
        <div className="create-heading">
          <Link to="/app/commission-programs" aria-label="Back to commission programs">
            <ArrowLeft aria-hidden="true" size={18} />
          </Link>
          <h1>Create Commission Program</h1>
        </div>

        <div className="create-layout">
          <div className="form-column">
            <section className="form-card">
              <h2>
                Program Details
                <span aria-label="Program details info">ⓘ</span>
              </h2>
              <label>
                Program Name
                <input name="programName" placeholder="Enter program name" />
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
                <s-checkbox label="Limited Time Commission"></s-checkbox>
                <CalendarDays aria-hidden="true" size={16} />
              </div>
            </section>

            <section className="form-card">
              <h2>Product Selection</h2>
              <label className="radio-row">
                <input type="radio" name="productScope" value="all" defaultChecked />
                Include All Products
              </label>
              <label className="radio-row">
                <input type="radio" name="productScope" value="specific" />
                Include Specific Products
              </label>

              <label>
                Commission for All Products
                <div className="money-input">
                  <span>$</span>
                  <input name="commissionValue" inputMode="decimal" />
                </div>
              </label>
              <p>Set a fixed commission value in fixed amount</p>
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
      </div>

      <style>{CREATE_COMMISSION_STYLES}</style>
    </s-page>
  );
}

function checkboxChecked(event: { currentTarget: unknown }) {
  return Boolean((event.currentTarget as unknown as { checked: boolean }).checked);
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
    margin: 0 auto;
    max-width: 1040px;
  }

  .create-heading {
    align-items: center;
    display: flex;
    gap: 12px;
  }

  .create-heading a {
    color: #303030;
    display: inline-flex;
    text-decoration: none;
  }

  .create-heading h1 {
    font-size: 24px;
    margin: 0;
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
    min-height: 42px;
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

  .indented-help {
    margin-left: 30px;
  }

  .radio-row {
    align-items: center;
    display: flex !important;
    gap: 10px !important;
  }

  .radio-row input {
    min-height: auto;
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
    min-height: 40px;
    outline: 0;
  }

  .search-field {
    align-items: center;
    border: 1px solid #8c9196;
    border-radius: 8px;
    display: flex;
    gap: 8px;
    min-height: 42px;
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
