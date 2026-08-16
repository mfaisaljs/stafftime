import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useQueryParamToast } from "../hooks/useQueryParamToast";
import { useAppNavigate } from "../hooks/useAppNavigate";
import { AppPage } from "../components/AppPage";
import {
  Check,
  Eye,
  FileText,
  ListTodo,
  MapPin,
  Plus,
  CalendarDays,
  User,
} from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployeeLocations } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const [taskLists, locations] = await Promise.all([
    prisma.taskList.findMany({
      where: { shopId: shop.id },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getEmployeeLocations(session),
  ]);

  const locationNameById = new Map(
    locations.map((location) => [location.id, location.name]),
  );

  return {
    taskLists: taskLists.map((list) => {
      const locationIds = parseJsonArray(list.locationIds);
      const locationLabel =
        list.locationAccess === "ALL"
          ? "All Locations"
          : locationIds
              .map((id) => locationNameById.get(id) ?? id)
              .filter(Boolean)
              .join(", ") || "—";

      const assignedTo: string[] = [];
      if (list.assignStaff) assignedTo.push("Staff");
      if (list.assignManagers) assignedTo.push("Managers");

      return {
        id: list.id,
        name: list.name,
        active: list.active,
        taskCount: list._count.items,
        timeline: timelineLabel(parseJsonArray(list.timelines)[0] ?? ""),
        locations: locationLabel,
        assignedTo,
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "toggleActive") return { ok: false };

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return { ok: false };

  await prisma.taskList.updateMany({
    where: { id, shopId: shop.id },
    data: { active },
  });

  return { ok: true };
};

export default function TaskListsIndexPage() {
  const { taskLists } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useAppNavigate();
  const isEmpty = taskLists.length === 0;

  useQueryParamToast({
    saved: "Task list saved.",
  });

  return (
    <AppPage heading="TaskLists" inlineSize="large">
      <s-button
        slot="primary-action"
        type="button"
        variant="primary"
        onClick={() => navigate("/app/tasklists/new")}
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
          <s-button
            type="button"
            variant="primary"
            onClick={() => navigate("/app/tasklists/new")}
          >
            <span className="button-content">
              <Plus aria-hidden="true" size={13} />
              Create Task List
            </span>
          </s-button>
        </section>
      ) : (
        <section className="lists-card">
          <div className="lists-header">
            <span>
              <Check size={15} />
              Status
            </span>
            <span>
              <ListTodo size={15} />
              Task List
            </span>
            <span>
              <CalendarDays size={15} />
              Timeline
            </span>
            <span>
              <MapPin size={15} />
              Locations
            </span>
            <span>
              <User size={15} />
              Assigned To
            </span>
            <span>Actions</span>
          </div>

          {taskLists.map((list) => {
            const pending =
              fetcher.state !== "idle" &&
              String(fetcher.formData?.get("id") || "") === list.id;

            return (
              <div
                className="lists-row is-clickable"
                key={list.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/app/tasklists/${list.id}/edit`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/app/tasklists/${list.id}/edit`);
                  }
                }}
              >
                <div
                  className="status-cell"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="toggleActive" />
                    <input type="hidden" name="id" value={list.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={list.active ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className={`status-toggle${list.active ? " is-active" : ""}`}
                      disabled={pending}
                      aria-label={
                        list.active ? "Deactivate task list" : "Activate task list"
                      }
                    >
                      <span />
                    </button>
                  </fetcher.Form>
                </div>

                <div className="list-name">
                  <strong>{list.name}</strong>
                  <span>
                    ({list.taskCount} Task{list.taskCount === 1 ? "" : "s"})
                  </span>
                </div>

                <div>
                  {list.timeline ? (
                    <span className="timeline-pill">{list.timeline}</span>
                  ) : (
                    "—"
                  )}
                </div>

                <div className="locations-cell">{list.locations}</div>

                <div className="assigned-cell">
                  {list.assignedTo.length > 0
                    ? list.assignedTo.map((label) => (
                        <span key={label} className="assigned-pill">
                          {label}
                        </span>
                      ))
                    : "—"}
                </div>

                <div
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => navigate(`/app/tasklists/${list.id}`)}
                  >
                    <span className="button-content">
                      <Eye aria-hidden="true" size={14} />
                      View Details
                    </span>
                  </s-button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <style>{TASKLISTS_STYLES}</style>
    </AppPage>
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

  .lists-card {
    overflow: hidden;
  }

  .lists-header,
  .lists-row {
    align-items: center;
    display: grid;
    gap: 12px;
    grid-template-columns:
      90px minmax(160px, 1.3fr) 110px minmax(140px, 1.2fr) minmax(120px, 1fr) 140px;
    padding: 14px 16px;
  }

  .lists-header {
    background: #f6f6f7;
    border-bottom: 1px solid #ececec;
    color: #202223;
    font-size: 13px;
    font-weight: 600;
  }

  .lists-header span {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .lists-row {
    border-bottom: 1px solid #ececec;
    color: #202223;
    font-size: 13px;
  }

  .lists-row.is-clickable {
    cursor: pointer;
  }

  .lists-row.is-clickable:hover {
    background: #fafafa;
  }

  .lists-row:last-child {
    border-bottom: 0;
  }

  .status-cell {
    display: inline-flex;
  }

  .status-toggle {
    align-items: center;
    background: #8c9196;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    height: 24px;
    justify-content: flex-start;
    padding: 2px;
    transition: background 120ms ease;
    width: 44px;
  }

  .status-toggle.is-active {
    background: #008060;
    justify-content: flex-end;
  }

  .status-toggle:disabled {
    cursor: wait;
  }

  .status-toggle span {
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    display: block;
    height: 20px;
    width: 20px;
  }

  .list-name {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .list-name strong {
    font-weight: 700;
  }

  .list-name span {
    color: #616161;
  }

  .timeline-pill {
    background: #e3f5e1;
    border-radius: 999px;
    color: #0c5132;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 3px 10px;
  }

  .locations-cell {
    color: #303030;
  }

  .assigned-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .assigned-pill {
    background: #e0f0ff;
    border-radius: 999px;
    color: #00527c;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    padding: 3px 10px;
  }

  @media (max-width: 980px) {
    .lists-card {
      overflow-x: auto;
    }

    .lists-header,
    .lists-row {
      min-width: 900px;
    }
  }
`;
