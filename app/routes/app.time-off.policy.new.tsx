import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { User } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployees } from "../services/admin.server";
import prisma from "../db.server";

const POLICY_TYPES = [
  { value: "TIME_OFF", label: "Time Off" },
  { value: "SICK_LEAVE", label: "Sick Leave" },
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employees = await getEmployees(session);

  return {
    employees: employees
      .filter((employee) => employee.status !== "ARCHIVED")
      .map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        position: employee.position ?? roleLabel(employee.role),
      })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const policyType = String(formData.get("policyType") ?? "TIME_OFF");
  const compensation = String(formData.get("compensation") ?? "UNPAID");
  const fullDayDuration = Number(formData.get("fullDayDuration") ?? 8);
  const employeeIds = formData
    .getAll("employeeIds")
    .map(String)
    .filter(Boolean);

  if (!name) {
    return { error: "Policy name is required." };
  }
  if (!POLICY_TYPES.some((option) => option.value === policyType)) {
    return { error: "Select a valid policy type." };
  }
  if (compensation !== "PAID" && compensation !== "UNPAID") {
    return { error: "Select paid or unpaid status." };
  }
  if (!Number.isFinite(fullDayDuration) || fullDayDuration <= 0) {
    return { error: "Full day duration must be greater than 0." };
  }

  await prisma.timeOffPolicy.create({
    data: {
      shopId: shop.id,
      name,
      policyType,
      compensation,
      fullDayDuration,
      employeeIds: JSON.stringify(employeeIds),
      active: true,
    },
  });

  return redirect("/app/time-off/policy?created=1");
};

export default function CreateTimeOffPolicyPage() {
  const { employees } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const isSubmitting = navigation.state === "submitting";
  const allSelected =
    employees.length > 0 && selectedIds.length === employees.length;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : employees.map((employee) => employee.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  return (
    <s-page heading="Create Policy" inlineSize="large">
      {actionData && "error" in actionData && actionData.error && (
        <s-banner heading={actionData.error} tone="critical" />
      )}

      <Form method="post" data-save-bar>
        <s-stack direction="block" gap="large">
          <FormSection
            title="Policy Information"
            description="Enter the details for the new policy."
          >
            <label className="field">
              <span>Policy Name</span>
              <input
                name="name"
                type="text"
                placeholder="Policy Name"
                required
              />
            </label>
            <label className="field">
              <span>Policy Type</span>
              <select name="policyType" defaultValue="TIME_OFF">
                {POLICY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </FormSection>

          <FormSection
            title="Paid/Unpaid Status"
            description="Select whether the policy is paid or unpaid."
          >
            <fieldset className="radio-fieldset">
              <legend>Paid Status</legend>
              <label className="radio-option">
                <input
                  type="radio"
                  name="compensation"
                  value="UNPAID"
                  defaultChecked
                />
                Unpaid
              </label>
              <label className="radio-option">
                <input type="radio" name="compensation" value="PAID" />
                Paid
              </label>
            </fieldset>
          </FormSection>

          <FormSection
            title="Full Day Duration"
            description="Enter the duration for a full day."
          >
            <label className="field duration-field">
              <span>Full Day Duration</span>
              <span className="duration-input">
                <input
                  name="fullDayDuration"
                  type="number"
                  min="0.5"
                  step="0.5"
                  defaultValue="8"
                  required
                />
                <span className="suffix">Hours</span>
              </span>
            </label>
          </FormSection>

          <FormSection
            title="Assigned Staff Members"
            description="Select the staff members to whom this policy applies."
          >
            <div className="staff-table-wrap">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th className="check-col">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all staff"
                      />
                    </th>
                    <th>Staff</th>
                    <th>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td className="check-col">
                        <input
                          type="checkbox"
                          name="employeeIds"
                          value={employee.id}
                          checked={selectedSet.has(employee.id)}
                          onChange={() => toggleOne(employee.id)}
                          aria-label={`Select ${employee.name}`}
                        />
                      </td>
                      <td>
                        <span className="staff-cell">
                          <span className="staff-icon" aria-hidden="true">
                            <User size={14} />
                          </span>
                          {employee.name}
                        </span>
                      </td>
                      <td>{employee.position}</td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty-cell">
                        No staff members available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </FormSection>

          <div className="form-actions">
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Create Policy
            </s-button>
            <s-button
              type="button"
              variant="secondary"
              onClick={() => navigate("/app/time-off/policy")}
            >
              Cancel
            </s-button>
          </div>
        </s-stack>
      </Form>

      <style>{CREATE_POLICY_STYLES}</style>
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

function roleLabel(role: string) {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "REGIONAL_MANAGER":
    case "STORE_MANAGER":
      return "Manager";
    case "SUPERVISOR":
      return "Supervisor";
    default:
      return "Staff";
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const CREATE_POLICY_STYLES = `
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

  .field {
    display: grid;
    gap: 6px;
  }

  .field > span {
    color: #303030;
    font-size: 13px;
    font-weight: 600;
  }

  .field input,
  .field select {
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 8px;
    color: #303030;
    font: inherit;
    min-height: 36px;
    padding: 0 12px;
    width: 100%;
  }

  .radio-fieldset {
    border: 0;
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
  }

  .radio-fieldset legend {
    color: #303030;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
    padding: 0;
  }

  .radio-option {
    align-items: center;
    color: #303030;
    display: inline-flex;
    gap: 8px;
  }

  .duration-field {
    max-width: 280px;
  }

  .duration-input {
    align-items: center;
    display: grid;
    grid-template-columns: 1fr auto;
    position: relative;
  }

  .duration-input input {
    padding-right: 64px;
  }

  .duration-input .suffix {
    color: #616161;
    font-size: 13px;
    pointer-events: none;
    position: absolute;
    right: 12px;
  }

  .staff-table-wrap {
    border: 1px solid #ebebeb;
    border-radius: 10px;
    overflow: hidden;
  }

  .staff-table {
    border-collapse: collapse;
    width: 100%;
  }

  .staff-table th,
  .staff-table td {
    border-bottom: 1px solid #ebebeb;
    color: #303030;
    padding: 12px 14px;
    text-align: left;
  }

  .staff-table th {
    background: #fafafa;
    color: #616161;
    font-size: 12px;
    font-weight: 650;
  }

  .staff-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .check-col {
    width: 44px;
  }

  .staff-cell {
    align-items: center;
    display: inline-flex;
    gap: 10px;
  }

  .staff-icon {
    align-items: center;
    background: #6b4eff;
    border-radius: 6px;
    color: #fff;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .empty-cell {
    color: #616161;
    text-align: center !important;
  }

  .form-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  @media (max-width: 800px) {
    .form-section {
      grid-template-columns: 1fr;
    }
  }
`;
