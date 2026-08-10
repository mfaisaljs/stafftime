import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useMemo, useState } from "react";
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
    created: new URL(request.url).searchParams.get("created") === "1",
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
  const { policies, created } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = policies.length > 0 && selected.length === policies.length;

  const showCreated = useMemo(
    () => created || searchParams.get("created") === "1",
    [created, searchParams],
  );

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
    <s-page heading="Policy Management" inlineSize="large">
      <s-button
        slot="primary-action"
        type="button"
        variant="primary"
        onClick={() => navigate("/app/time-off/policy/new")}
      >
        Create Policy
      </s-button>

      {showCreated && (
        <s-banner tone="success" heading="Policy created." />
      )}

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
                <tr key={policy.id}>
                  <td className="check-col">
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
    </s-page>
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
