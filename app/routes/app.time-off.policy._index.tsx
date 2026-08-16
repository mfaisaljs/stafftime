import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { AppPage } from "../components/AppPage";
import { useState } from "react";
import { useQueryParamToast } from "../hooks/useQueryParamToast";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const policies = await prisma.timeOffPolicy.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });

  return {
    policies: policies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      compensation: compensationLabel(policy.compensation),
      fullDayDuration: String(policy.fullDayDuration),
      policyType: policyTypeLabel(policy.policyType),
      active: policy.active,
    })),
  };
};

export default function TimeOffPolicyIndexPage() {
  const { policies } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = policies.length > 0 && selected.length === policies.length;

  useQueryParamToast({
    created: "Policy created.",
    updated: "Policy updated.",
  });

  const toggleAll = () => {
    setSelected(allSelected ? [] : policies.map((policy) => policy.id));
  };

  const toggleOne = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  return (
    <AppPage heading="Policy Management" inlineSize="large">
      <s-button
        slot="primary-action"
        type="button"
        variant="primary"
        onClick={() => navigate("/app/time-off/policy/new")}
      >
        Create Policy
      </s-button>

      <section className="policy-card">
        <div className="table-scroll">
          <table className="policy-table">
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all policies"
                  />
                </th>
                <th>Policy Name</th>
                <th>Compensation</th>
                <th>Full Day Duration</th>
                <th>Policy Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr
                  key={policy.id}
                  className="is-clickable"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/app/time-off/policy/${policy.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/app/time-off/policy/${policy.id}`);
                    }
                  }}
                >
                  <td
                    className="check-col"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(policy.id)}
                      onChange={() => toggleOne(policy.id)}
                      aria-label={`Select ${policy.name}`}
                    />
                  </td>
                  <td>{policy.name}</td>
                  <td>{policy.compensation}</td>
                  <td>{policy.fullDayDuration}</td>
                  <td>{policy.policyType}</td>
                  <td>
                    <span className={`status-pill${policy.active ? " active" : ""}`}>
                      {policy.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No policies yet. Create your first policy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{POLICY_LIST_STYLES}</style>
    </AppPage>
  );
}

function compensationLabel(value: string) {
  return value === "PAID" ? "Paid" : "Unpaid";
}

function policyTypeLabel(value: string) {
  if (value === "SICK_LEAVE") return "Sick Leave";
  return "Time Off";
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const POLICY_LIST_STYLES = `
  .policy-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    min-width: 0;
    overflow: hidden;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .policy-table {
    border-collapse: collapse;
    min-width: 720px;
    width: 100%;
  }

  .policy-table th,
  .policy-table td {
    border-bottom: 1px solid #ebebeb;
    color: #303030;
    padding: 14px 16px;
    text-align: left;
    white-space: nowrap;
  }

  .policy-table th {
    background: #fafafa;
    color: #616161;
    font-size: 13px;
    font-weight: 650;
  }

  .policy-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .policy-table tbody tr.is-clickable {
    cursor: pointer;
  }

  .policy-table tbody tr.is-clickable:hover {
    background: #fafafa;
  }

  .check-col {
    width: 44px;
  }

  .status-pill {
    background: #f1f1f1;
    border-radius: 999px;
    color: #616161;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 4px 10px;
  }

  .status-pill.active {
    background: #e3f8e8;
    color: #0b6b32;
  }

  .empty-cell {
    color: #616161;
    text-align: center !important;
  }
`;
