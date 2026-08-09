import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployees,
  getSchedules,
} from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [shifts, employees] = await Promise.all([
    getSchedules(session),
    getEmployees(session),
  ]);
  return { shifts, employees };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();

  const employeeId = String(formData.get("employeeId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const notes = String(formData.get("notes") ?? "");

  const location = await prisma.storeLocation.findFirst({
    where: { shopId: shop.id },
  });

  if (!location) {
    throw new Response("No store location configured", { status: 400 });
  }

  await prisma.shift.create({
    data: {
      shopId: shop.id,
      locationId: location.id,
      employeeId,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      notes: notes || undefined,
    },
  });

  return null;
};

export default function SchedulesPage() {
  const { shifts, employees } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Shift Scheduling">
      <s-section heading="Create Shift">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Employee
              <select name="employeeId" required>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start
              <input type="datetime-local" name="startsAt" required />
            </label>
            <label>
              End
              <input type="datetime-local" name="endsAt" required />
            </label>
            <label>
              Notes
              <input type="text" name="notes" />
            </label>
            <s-button type="submit" variant="primary">
              Create shift
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Upcoming Shifts">
        <s-stack direction="block" gap="base">
          {shifts.map((shift) => (
            <s-box key={shift.id} padding="base" background="subdued">
              <s-text>
                {shift.employee.firstName} {shift.employee.lastName} ·{" "}
                {shift.startsAt.toLocaleString()} –{" "}
                {shift.endsAt.toLocaleTimeString()}
                {shift.notes ? ` · ${shift.notes}` : ""}
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
