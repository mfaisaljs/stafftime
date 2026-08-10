import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { FileText, Plus } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const taskLists = await prisma.taskList.findMany({
    where: { shopId: shop.id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return {
    taskLists: taskLists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      taskCount: list.items.length,
      timelines: parseJsonArray(list.timelines),
    })),
  };
};

export default function TaskListsIndexPage() {
  const { taskLists } = useLoaderData<typeof loader>();
  const isEmpty = taskLists.length === 0;

  return (
    <s-page heading="TaskLists" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/tasklists/new"
      >
        <span className="button-content">
          <Plus aria-hidden="true" size={14} />
          Create Task List
        </span>
      </s-button>

      {isEmpty ? (
        <section className="empty-card">
          <div className="empty-illustration" aria-hidden="true">
            <span className="empty-circle" />
            <FileText size={72} />
            <span className="empty-accent" />
          </div>
          <strong>Create your first task list</strong>
          <p>Start organizing tasks for your team and locations.</p>
          <s-button variant="primary" href="/app/tasklists/new">
            <span className="button-content">
              <Plus aria-hidden="true" size={13} />
              Create Task List
            </span>
          </s-button>
        </section>
      ) : (
        <section className="lists-card">
          <table className="lists-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Timeline</th>
                <th>Tasks</th>
              </tr>
            </thead>
            <tbody>
              {taskLists.map((list) => (
                <tr key={list.id}>
                  <td>
                    <strong>{list.name}</strong>
                    {list.description ? <small>{list.description}</small> : null}
                  </td>
                  <td>
                    {list.timelines.length > 0
                      ? list.timelines.map(timelineLabel).join(", ")
                      : "—"}
                  </td>
                  <td>{list.taskCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <style>{TASKLISTS_STYLES}</style>
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
  return labels[value] ?? value;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const TASKLISTS_STYLES = `
  .button-content {
    align-items: center;
    display: inline-flex;
    gap: 4px;
  }

  .empty-card,
  .lists-card {
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 12px;
  }

  .empty-card {
    align-items: center;
    display: grid;
    gap: 8px;
    justify-items: center;
    min-height: 360px;
    padding: 56px 24px;
    text-align: center;
  }

  .empty-card strong {
    color: #202223;
    font-size: 16px;
  }

  .empty-card p {
    color: #616161;
    margin: 0 0 10px;
  }

  .empty-illustration {
    color: #c9c9c9;
    display: grid;
    margin-bottom: 12px;
    place-items: center;
    position: relative;
  }

  .empty-circle {
    background: #f1f1f1;
    border-radius: 999px;
    height: 120px;
    left: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 120px;
    z-index: 0;
  }

  .empty-illustration svg {
    position: relative;
    z-index: 1;
  }

  .empty-accent {
    background: #f5b63b;
    border-radius: 2px;
    height: 20px;
    left: calc(50% - 28px);
    position: absolute;
    top: calc(50% - 28px);
    width: 20px;
    z-index: 2;
  }

  .lists-table {
    border-collapse: collapse;
    width: 100%;
  }

  .lists-table th,
  .lists-table td {
    border-bottom: 1px solid #ececec;
    color: #303030;
    font-size: 13px;
    padding: 14px 16px;
    text-align: left;
    vertical-align: top;
  }

  .lists-table th {
    background: #f6f6f7;
    color: #616161;
    font-weight: 600;
  }

  .lists-table tr:last-child td {
    border-bottom: 0;
  }

  .lists-table strong,
  .lists-table small {
    display: block;
  }

  .lists-table small {
    color: #616161;
    margin-top: 2px;
  }
`;
