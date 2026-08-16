import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import TaskListForm from "../components/tasklists/TaskListForm";
import { parseTaskListForm } from "../components/tasklists/parseTaskListForm";
import { authenticate } from "../shopify.server";
import {
  getAdminShop,
  getEmployeeLocations,
  getEmployees,
} from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [employees, locations] = await Promise.all([
    getEmployees(session),
    getEmployeeLocations(session),
  ]);

  return {
    employees: employees
      .filter((employee) => employee.status !== "ARCHIVED")
      .map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        role: employee.role,
      })),
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const parsed = parseTaskListForm(await request.formData());
  if ("error" in parsed) return { error: parsed.error };

  await prisma.taskList.create({
    data: {
      shopId: shop.id,
      name: parsed.name,
      description: parsed.description,
      assignStaff: parsed.assignStaff,
      assignManagers: parsed.assignManagers,
      staffScope: parsed.staffScope,
      managerScope: parsed.managerScope,
      employeeIds: JSON.stringify(parsed.employeeIds),
      managerIds: JSON.stringify(parsed.managerIds),
      locationAccess: parsed.locationAccess,
      locationIds: JSON.stringify(parsed.locationIds),
      timelines: JSON.stringify(parsed.timelines),
      items: {
        create: parsed.tasks.map((task, index) => ({
          title: task.title,
          active: true,
          sortOrder: index,
        })),
      },
    },
  });

  return redirect("/app/tasklists?saved=1");
};

export default function CreateTaskListPage() {
  const { employees, locations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <TaskListForm
      mode="create"
      employees={employees}
      locations={locations}
      actionError={actionData?.error ?? null}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
