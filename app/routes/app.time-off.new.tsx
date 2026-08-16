import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { ReactNode } from "react";
import { AppPage } from "../components/AppPage";
import { useMemo, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeLocations,
  getEmployees,
} from "../services/admin.server";
import { InlineDateRangeCalendar } from "../components/InlineDateRangeCalendar";
import { toDateKey } from "../components/DateRangeSelector";
import { useSaveBarToast } from "../hooks/useSaveBarToast";
import {
  createApprovedTimeOffRequestForShop,
} from "../services/time-off-shifts.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const [employees, locations, policies] = await Promise.all([
    getEmployees(session),
    getEmployeeLocations(session),
    prisma.timeOffPolicy.findMany({
      where: { shopId: shop.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
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
    policies: policies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      employeeIds: parseIds(policy.employeeIds),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const policyId = String(formData.get("policyId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDateRaw = String(formData.get("endDate") ?? "").trim();
  const endDate = endDateRaw || startDate;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!employeeId) return { error: "Select a staff member." };
  if (!policyId) return { error: "Select a policy." };
  if (!locationId) return { error: "Select a location." };
  if (!isDateKey(startDate) || !isDateKey(endDate) || endDate < startDate) {
    return { error: "Select a valid start and end date range." };
  }

  const [employee, policy, location] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, shopId: shop.id, status: { not: "ARCHIVED" } },
    }),
    prisma.timeOffPolicy.findFirst({
      where: { id: policyId, shopId: shop.id, active: true },
    }),
    prisma.storeLocation.findFirst({
      where: { id: locationId, shopId: shop.id },
    }),
  ]);

  if (!employee) return { error: "Selected staff member was not found." };
  if (!policy) return { error: "Selected policy was not found." };
  if (!location) return { error: "Selected location was not found." };

  try {
    await createApprovedTimeOffRequestForShop({
      shopId: shop.id,
      employeeId,
      policyId,
      locationId,
      startDate,
      endDate,
      reason: reason || null,
      employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not create time off request.",
    };
  }

  return redirect("/app/time-off?created=1");
};

export default function CreateTimeOffPage() {
  const { employees, locations, policies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  useSaveBarToast(actionData);
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";
  const today = toDateKey(new Date());
  const [employeeId, setEmployeeId] = useState("");
  const [dateRange, setDateRange] = useState({ start: today, end: today });

  const availablePolicies = useMemo(() => {
    if (!employeeId) return policies;
    return policies.filter(
      (policy) =>
        policy.employeeIds.length === 0 ||
        policy.employeeIds.includes(employeeId),
    );
  }, [employeeId, policies]);

  return (
    <AppPage heading="Create Time Off" inlineSize="large">
      <Form method="post" data-save-bar>
        <s-stack direction="block" gap="large">
          <FormSection
            title="Select Staff"
            description="Choose the staff member requesting time off."
          >
            <label className="field">
              <span>Staff</span>
              <select
                name="employeeId"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.currentTarget.value)}
                required
              >
                <option value="">Select Staff</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
          </FormSection>

          <FormSection
            title="Select Policy"
            description="Choose the policy applicable for this time off."
          >
            <label className="field">
              <span>Policy</span>
              <select name="policyId" defaultValue="" required>
                <option value="">Select Policy</option>
                {availablePolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </label>
          </FormSection>

          <FormSection
            title="Select Location"
            description="Choose the location for this time off."
          >
            <label className="field">
              <span>Location</span>
              <select name="locationId" defaultValue="" required>
                <option value="">Select Location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </FormSection>

          <FormSection
            title="Select Dates"
            description="Specify the start and end dates for the time off."
          >
            <InlineDateRangeCalendar
              start={dateRange.start}
              end={dateRange.end}
              onChange={setDateRange}
            />
          </FormSection>

          <FormSection
            title="Reason"
            description="Provide a reason for the time off request."
          >
            <label className="field">
              <span>Reason</span>
              <textarea
                name="reason"
                rows={5}
                placeholder="Enter reason for time off"
              />
            </label>
          </FormSection>

          <div className="form-actions">
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Create Time Off
            </s-button>
            <s-button
              type="button"
              variant="secondary"
              onClick={() => navigate("/app/time-off")}
            >
              Cancel
            </s-button>
          </div>
        </s-stack>
      </Form>

      <style>{CREATE_TIME_OFF_STYLES}</style>
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

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const CREATE_TIME_OFF_STYLES = `
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

  .field select,
  .field textarea {
    background: #fff;
    border: 1px solid #c9cccf;
    border-radius: 8px;
    color: #303030;
    font: inherit;
    width: 100%;
  }

  .field select {
    min-height: 36px;
    padding: 0 12px;
  }

  .field textarea {
    min-height: 120px;
    padding: 10px 12px;
    resize: vertical;
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
