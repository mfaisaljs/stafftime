import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployees } from "../services/admin.server";
import { createEmployee } from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getEmployees(session);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  try {
    await createEmployee({
      shopId: shop.id,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? "") || undefined,
      pin: String(formData.get("pin") ?? "0000"),
      department: String(formData.get("department") ?? "") || undefined,
      hourlyRate: Number(formData.get("hourlyRate") ?? 0),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not add employee",
    };
  }

  return null;
};

export default function EmployeesPage() {
  const employees = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Employees">
      <s-section heading="Add Employee">
        {actionData?.error && (
          <s-banner heading={actionData.error} tone="critical" />
        )}
        <Form method="post">
          <s-stack direction="block" gap="base">
            <input name="firstName" placeholder="First name" required />
            <input name="lastName" placeholder="Last name" required />
            <input name="email" placeholder="Email" type="email" />
            <input name="department" placeholder="Department" />
            <input name="hourlyRate" placeholder="Hourly rate" type="number" step="0.01" />
            <input name="pin" placeholder="PIN (4+ digits)" required minLength={4} />
            <s-button type="submit" variant="primary">
              Add employee
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Team">
        <s-stack direction="block" gap="base">
          {employees.map((employee) => (
            <s-box key={employee.id} padding="base" background="subdued">
              <s-text>
                {employee.firstName} {employee.lastName} · {employee.role} ·{" "}
                {employee.department ?? "No department"} · PIN protected · QR{" "}
                {employee.qrCode.slice(0, 8)}...
              </s-text>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
