import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployeeLocations, getEmployees } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const listId = params.listId;
  if (!listId) throw new Response("Task list not found", { status: 404 });

  const shop = await getAdminShop(session);
  const [list, locations, employees] = await Promise.all([
    prisma.taskList.findFirst({
      where: { id: listId, shopId: shop.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    getEmployeeLocations(session),
    getEmployees(session),
  ]);

  if (!list) throw new Response("Task list not found", { status: 404 });

  const locationNameById = new Map(
    locations.map((location) => [location.id, location.name]),
  );
  const employeeNameById = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`.trim(),
    ]),
  );

  const locationIds = parseJsonArray(list.locationIds);
  const employeeIds = parseJsonArray(list.employeeIds);
  const managerIds = parseJsonArray(list.managerIds);

  return {
    list: {
      id: list.id,
      name: list.name,
      description: list.description,
      active: list.active,
      timeline: timelineLabel(parseJsonArray(list.timelines)[0] ?? ""),
      locations:
        list.locationAccess === "ALL"
          ? "All Locations"
          : locationIds
              .map((id) => locationNameById.get(id) ?? id)
              .join(", ") || "—",
      assignStaff: list.assignStaff,
      assignManagers: list.assignManagers,
      staffScope: list.staffScope,
      managerScope: list.managerScope,
      staffNames:
        list.staffScope === "SELECTED"
          ? employeeIds.map((id) => employeeNameById.get(id) ?? id)
          : [],
      managerNames:
        list.managerScope === "SELECTED"
          ? managerIds.map((id) => employeeNameById.get(id) ?? id)
          : [],
      tasks: list.items.map((item) => ({
        id: item.id,
        title: item.title,
        active: item.active,
      })),
    },
  };
};

export default function TaskListDetailPage() {
  const { list } = useLoaderData<typeof loader>();

  return (
    <s-page heading={list.name} inlineSize="large">
      <s-button slot="secondary-actions" href="/app/tasklists" variant="secondary">
        Back
      </s-button>

      <section className="detail-card">
        <div className="detail-row">
          <span>Status</span>
          <strong>{list.active ? "Active" : "Inactive"}</strong>
        </div>
        <div className="detail-row">
          <span>Description</span>
          <strong>{list.description || "—"}</strong>
        </div>
        <div className="detail-row">
          <span>Timeline</span>
          <strong>{list.timeline || "—"}</strong>
        </div>
        <div className="detail-row">
          <span>Locations</span>
          <strong>{list.locations}</strong>
        </div>
        <div className="detail-row">
          <span>Assigned To</span>
          <strong>
            {[
              list.assignStaff
                ? list.staffScope === "ALL"
                  ? "All Staff"
                  : `Staff (${list.staffNames.join(", ") || "none"})`
                : null,
              list.assignManagers
                ? list.managerScope === "ALL"
                  ? "All Managers"
                  : `Managers (${list.managerNames.join(", ") || "none"})`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </strong>
        </div>
      </section>

      <section className="detail-card tasks-card">
        <h2>Tasks ({list.tasks.length})</h2>
        {list.tasks.length === 0 ? (
          <p>No tasks in this list.</p>
        ) : (
          <ul>
            {list.tasks.map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <span className={task.active ? "active" : "inactive"}>
                  {task.active ? "Active" : "Inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{DETAIL_STYLES}</style>
    </s-page>
  );
}

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

function timelineLabel(value: string) {
  const labels: Record<string, string> = {
    DAILY: "Daily",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
  };
  return labels[value] ?? "";
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const DETAIL_STYLES = `
  .detail-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    display: grid;
    gap: 12px;
    margin-bottom: 16px;
    padding: 18px;
  }

  .detail-row {
    display: grid;
    gap: 4px;
  }

  .detail-row span {
    color: #616161;
    font-size: 12px;
  }

  .tasks-card h2 {
    font-size: 15px;
    margin: 0;
  }

  .tasks-card ul {
    display: grid;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .tasks-card li {
    align-items: center;
    border: 1px solid #ececec;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    padding: 10px 12px;
  }

  .tasks-card .active {
    color: #008060;
    font-size: 12px;
    font-weight: 650;
  }

  .tasks-card .inactive {
    color: #8a8a8a;
    font-size: 12px;
    font-weight: 650;
  }
`;
