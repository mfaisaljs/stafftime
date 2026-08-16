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

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const listId = params.listId;
  if (!listId) throw new Response("Task list not found", { status: 404 });

  const shop = await getAdminShop(session);
  const [list, employees, locations] = await Promise.all([
    prisma.taskList.findFirst({
      where: { id: listId, shopId: shop.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    getEmployees(session),
    getEmployeeLocations(session),
  ]);

  if (!list) throw new Response("Task list not found", { status: 404 });

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
    list: {
      name: list.name,
      description: list.description,
      assignStaff: list.assignStaff,
      assignManagers: list.assignManagers,
      staffScope:
        list.staffScope === "SELECTED"
          ? ("SELECTED" as const)
          : ("ALL" as const),
      managerScope:
        list.managerScope === "SELECTED"
          ? ("SELECTED" as const)
          : ("ALL" as const),
      employeeIds: parseJsonArray(list.employeeIds),
      managerIds: parseJsonArray(list.managerIds),
      locationAccess:
        list.locationAccess === "SPECIFIC"
          ? ("SPECIFIC" as const)
          : ("ALL" as const),
      locationIds: parseJsonArray(list.locationIds),
      timeline: parseJsonArray(list.timelines)[0] ?? "",
      tasks: list.items.map((item) => ({
        id: item.id,
        title: item.title,
        active: item.active,
      })),
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const listId = params.listId;
  if (!listId) return { error: "Task list not found" };

  const shop = await getAdminShop(session);
  const existing = await prisma.taskList.findFirst({
    where: { id: listId, shopId: shop.id },
    include: { items: { select: { id: true } } },
  });
  if (!existing) return { error: "Task list not found" };

  const parsed = parseTaskListForm(await request.formData());
  if ("error" in parsed) return { error: parsed.error };

  const existingItemIds = new Set(existing.items.map((item) => item.id));
  const keepIds = parsed.tasks
    .map((task) => task.id)
    .filter((id): id is string => Boolean(id) && existingItemIds.has(id));

  await prisma.$transaction(async (tx) => {
    await tx.taskList.update({
      where: { id: listId },
      data: {
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
      },
    });

    await tx.taskListItem.deleteMany({
      where: {
        taskListId: listId,
        id: { notIn: keepIds },
      },
    });

    for (const [index, task] of parsed.tasks.entries()) {
      if (task.id && existingItemIds.has(task.id)) {
        await tx.taskListItem.update({
          where: { id: task.id },
          data: {
            title: task.title,
            sortOrder: index,
            active: true,
          },
        });
      } else {
        await tx.taskListItem.create({
          data: {
            taskListId: listId,
            title: task.title,
            sortOrder: index,
            active: true,
          },
        });
      }
    }
  });

  return redirect("/app/tasklists?saved=1");
};

export default function EditTaskListPage() {
  const { employees, locations, list } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <TaskListForm
      mode="edit"
      employees={employees}
      locations={locations}
      initialList={list}
      actionError={actionData?.error ?? null}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
